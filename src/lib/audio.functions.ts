import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {createHash} from "node:crypto";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {voiceProvider,musicProvider} from "./audio.providers.server";
import { settleVisualJobFailure, type VisualJobFailureState } from "./visual-job-persistence";
const db:any=supabaseAdmin;
async function url(path:string){const {data,error}=await db.storage.from("project-assets").createSignedUrl(path,900);if(error)throw new Error("Playback URL unavailable");return data.signedUrl}
async function job(s:any,slug:string,projectId:string,input:any){const r=await s.rpc("start_generation_job",{_task_slug:slug,_project_id:projectId,_input:input});if(r.error||!r.data)throw new Error(r.error?.message||"Couldn't start generation");return r.data as string}
type AudioFailureCleanup = {
 completionMayHaveSucceeded?: boolean;
 cleanupAsset?: () => Promise<void>;
 cleanupUpload?: () => Promise<void>;
};
async function failJob(id:string,msg:string,cleanup:AudioFailureCleanup={}) {
 return settleVisualJobFailure(async(message:string):Promise<VisualJobFailureState>=>{
  const {data,error}=await db.rpc("fail_generation_job_checked",{_job_id:id,_error:message.slice(0,500)});
  if(error||typeof data!=="string")throw new Error("Could not confirm audio job settlement.");
  const allowed:VisualJobFailureState[]=["failed_refunded","failed_without_reservation","already_failed","already_complete","not_found","not_active"];
  if(!allowed.includes(data as VisualJobFailureState))throw new Error("Audio job settlement returned an unknown state.");
  return data as VisualJobFailureState;
 },msg,cleanup);
}
async function doneJob(id:string,out:any){
 const {error}=await db.rpc("complete_generation_job",{_job_id:id,_output:out});
 if(error)throw new Error("Could not finalize the audio generation job.");
}

export const generateSceneVoiceover=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),sceneId:z.string().uuid(),voiceId:z.string().uuid(),instructions:z.string().max(500).optional(),speed:z.number().min(.25).max(4).optional()}).parse(d)).handler(async({data,context})=>{
 const s:any=context.supabase;
 const sceneResult=await s.from("scenes").select("id,title,narration").eq("id",data.sceneId).eq("project_id",data.projectId).maybeSingle();
 if(sceneResult.error||!sceneResult.data)return{ok:false,error:"Scene not found."};
 const scene=sceneResult.data;
 if(!scene.narration?.trim())return{ok:false,error:"Add narration first."};
 const voiceResult=await s.from("voices").select("id,provider,provider_voice_id,name").eq("id",data.voiceId).maybeSingle();
 if(voiceResult.error||!voiceResult.data)return{ok:false,error:"Voice not found."};
 const voice=voiceResult.data;
 let id:string;
 try{id=await job(s,"tts_voiceover",data.projectId,{sceneId:data.sceneId,voiceId:data.voiceId})}
 catch(e:any){return{ok:false,error:e.message?.includes("INSUFFICIENT_CREDITS")?"Not enough credits.":"Couldn't start voiceover job."}}

 let outputPath:string|undefined;
 let outputAssetId:string|undefined;
 let outputVoiceoverId:string|undefined;
 let playbackUrl:string|undefined;
 let uploadAttempted=false;
 let assetInsertAttempted=false;
 let voiceoverInsertAttempted=false;
 let sceneAudioUpsertAttempted=false;
 let previousSceneAudio:any=null;
 let previousSceneAudioLoaded=false;
 let completionAttempted=false;

 try{
  const provider=voiceProvider(voice.provider);
  const audio=await provider.synthesize({text:scene.narration,voiceId:voice.provider_voice_id,instructions:data.instructions,speed:data.speed});
  const hash=createHash("sha256").update(scene.narration).digest("hex");
  outputPath=context.userId+"/"+data.projectId+"/audio/voiceovers/"+crypto.randomUUID()+".mp3";

  uploadAttempted=true;
  const upload=await db.storage.from("project-assets").upload(outputPath,audio.bytes,{contentType:audio.contentType});
  if(upload.error)throw new Error("Couldn't store voiceover.");

  assetInsertAttempted=true;
  const assetResult=await db.from("assets").insert({
    project_id:data.projectId,
    scene_id:data.sceneId,
    kind:"voice",
    name:scene.title+" — "+voice.name,
    storage_path:outputPath,
    meta:{provider:voice.provider,model:voice.provider==="openai"?"gpt-4o-mini-tts":"eleven_v3",text_hash:hash}
  }).select("id").single();
  if(assetResult.error||!assetResult.data?.id)throw new Error("Couldn't register voiceover asset.");
  outputAssetId=assetResult.data.id;

  voiceoverInsertAttempted=true;
  const voiceoverResult=await db.from("voiceovers").insert({
    project_id:data.projectId,
    scene_id:data.sceneId,
    voice_id:data.voiceId,
    generation_job_id:id,
    asset_id:outputAssetId,
    provider:voice.provider,
    model:voice.provider==="openai"?"gpt-4o-mini-tts":"eleven_v3",
    text:scene.narration,
    text_hash:hash,
    status:"ready"
  }).select("id").single();
  if(voiceoverResult.error||!voiceoverResult.data?.id)throw new Error("Couldn't register voiceover.");
  outputVoiceoverId=voiceoverResult.data.id;

  const previous=await db.from("scene_audio").select("*").eq("project_id",data.projectId).eq("scene_id",data.sceneId).maybeSingle();
  if(previous.error)throw new Error("Couldn't read the existing scene audio settings.");
  previousSceneAudio=previous.data;
  previousSceneAudioLoaded=true;

  sceneAudioUpsertAttempted=true;
  const attach=await db.from("scene_audio").upsert({
    project_id:data.projectId,
    scene_id:data.sceneId,
    voiceover_id:outputVoiceoverId,
    updated_at:new Date().toISOString()
  },{onConflict:"scene_id"});
  if(attach.error)throw new Error("Couldn't attach voiceover to the scene.");

  playbackUrl=await url(outputPath);
  completionAttempted=true;
  await doneJob(id,{voiceoverId:outputVoiceoverId,assetId:outputAssetId,path:outputPath});
  return{ok:true,url:playbackUrl,voiceoverId:outputVoiceoverId};
 }catch(e:any){
  const message=e instanceof Error?e.message:"Audio generation failed.";
  const outcome=await failJob(id,message,{
   completionMayHaveSucceeded:completionAttempted,
   cleanupAsset:outputPath&&(assetInsertAttempted||voiceoverInsertAttempted||sceneAudioUpsertAttempted)?async()=>{
    const problems:string[]=[];
    let voiceoverIdForCleanup=outputVoiceoverId;
    if(!voiceoverIdForCleanup&&voiceoverInsertAttempted){
     const lookup=await db.from("voiceovers").select("id").eq("generation_job_id",id).maybeSingle();
     if(lookup.error)problems.push("voiceover lookup");
     else voiceoverIdForCleanup=lookup.data?.id;
    }
    if(sceneAudioUpsertAttempted&&previousSceneAudioLoaded&&voiceoverIdForCleanup){
     const currentAudio=await db.from("scene_audio").select("*").eq("project_id",data.projectId).eq("scene_id",data.sceneId).maybeSingle();
     if(currentAudio.error)problems.push("scene audio lookup");
     else if(currentAudio.data?.voiceover_id===voiceoverIdForCleanup){
      const restored=previousSceneAudio
       ? await db.from("scene_audio").upsert(previousSceneAudio,{onConflict:"scene_id"})
       : await db.from("scene_audio").delete().eq("id",currentAudio.data.id).eq("voiceover_id",voiceoverIdForCleanup);
      if(restored.error)problems.push("scene audio restore");
     }
    }
    if(voiceoverInsertAttempted){
     const deleted=await db.from("voiceovers").delete().eq("generation_job_id",id);
     if(deleted.error)problems.push("voiceover record");
    }
    if(assetInsertAttempted){
     const deleted=await db.from("assets").delete().eq("project_id",data.projectId).eq("storage_path",outputPath);
     if(deleted.error)problems.push("asset record");
    }
    if(problems.length)throw new Error("Cleanup failed for "+problems.join(", ")+".");
   }:undefined,
   cleanupUpload:uploadAttempted&&outputPath?async()=>{
    const removed=await db.storage.from("project-assets").remove([outputPath]);
    if(removed.error)throw new Error("Uploaded voiceover cleanup failed.");
   }:undefined
  });
  if(outcome.completed&&outputVoiceoverId&&playbackUrl)return{ok:true,url:playbackUrl,voiceoverId:outputVoiceoverId};
  return{ok:false,error:outcome.error};
 });

export const previewVoice=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),voiceId:z.string().uuid()}).parse(d)).handler(async({data,context})=>{
 const s:any=context.supabase;
 const voiceResult=await s.from("voices").select("provider,provider_voice_id,preview_url").eq("id",data.voiceId).maybeSingle();
 if(voiceResult.error||!voiceResult.data)return{ok:false,error:"Voice not found."};
 const voice=voiceResult.data;
 if(voice.preview_url)return{ok:true,url:voice.preview_url,charged:false};
 let id:string;
 try{id=await job(s,"tts_preview",data.projectId,{voiceId:data.voiceId})}
 catch(e:any){return{ok:false,error:"Couldn't start preview."}}

 let outputPath:string|undefined;
 let playbackUrl:string|undefined;
 let uploadAttempted=false;
 let completionAttempted=false;
 try{
  const audio=await voiceProvider(voice.provider).synthesize({text:"This is a short preview for your video.",voiceId:voice.provider_voice_id});
  outputPath=context.userId+"/"+data.projectId+"/audio/previews/"+data.voiceId+"/"+crypto.randomUUID()+".mp3";
  uploadAttempted=true;
  const upload=await db.storage.from("project-assets").upload(outputPath,audio.bytes,{contentType:audio.contentType});
  if(upload.error)throw new Error("Couldn't store preview.");
  playbackUrl=await url(outputPath);
  completionAttempted=true;
  await doneJob(id,{preview:true,path:outputPath});
  return{ok:true,url:playbackUrl,charged:true};
 }catch(e:any){
  const message=e instanceof Error?e.message:"Audio preview failed.";
  const outcome=await failJob(id,message,{
   completionMayHaveSucceeded:completionAttempted,
   cleanupUpload:uploadAttempted&&outputPath?async()=>{
    const removed=await db.storage.from("project-assets").remove([outputPath]);
    if(removed.error)throw new Error("Preview file cleanup failed.");
   }:undefined
  });
  if(outcome.completed&&playbackUrl)return{ok:true,url:playbackUrl,charged:true};
  return{ok:false,error:outcome.error};
 }
});

export const syncElevenLabsVoices=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async()=>{
 const p=voiceProvider("elevenlabs");if(!p.listVoices)return{ok:false,error:"Voice listing unavailable"};const rows=await p.listVoices();if(rows.length){const {error}=await db.from("voices").upsert(rows.map((v:any)=>({provider:"elevenlabs",provider_voice_id:v.providerVoiceId,name:v.name,language:v.language,accent:v.accent,style:v.style,category:v.category,gender:v.gender,preview_url:v.previewUrl,status:"active",metadata:v.metadata||{},updated_at:new Date().toISOString()})),{onConflict:"provider,provider_voice_id"});if(error)throw error}return{ok:true,count:rows.length}
});

export const cloneVoice=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),assetId:z.string().uuid(),name:z.string().min(2).max(100),description:z.string().max(500).optional(),consentConfirmed:z.literal(true)}).parse(d)).handler(async({data,context})=>{
 const s:any=context.supabase;
 const assetResult=await s.from("assets").select("id,storage_path,name,meta").eq("id",data.assetId).eq("project_id",data.projectId).maybeSingle();
 if(assetResult.error||!assetResult.data?.storage_path)return{ok:false,error:"Voice sample not found."};
 const asset=assetResult.data;
 let id:string;
 try{id=await job(s,"clone_voice",data.projectId,{assetId:data.assetId,consentConfirmed:true})}
 catch(e:any){return{ok:false,error:"Couldn't start cloning."}}

 let createdVoiceId:string|undefined;
 let cloneId:string|undefined;
 let completionAttempted=false;
 try{
  const file=await db.storage.from("project-assets").download(asset.storage_path);
  if(file.error)throw new Error("Couldn't read sample.");
  const bytes=Buffer.from(await file.data.arrayBuffer());
  const provider=voiceProvider("elevenlabs");
  if(!provider.clone)throw new Error("Voice cloning is unavailable.");
  const clone=await provider.clone({
   name:data.name,
   description:data.description,
   file:bytes,
   filename:asset.name,
   contentType:asset.meta?.type||"audio/mpeg"
  });
  createdVoiceId=clone.voiceId;
  const cloneResult=await db.from("voice_clones").insert({
   user_id:context.userId,
   project_id:data.projectId,
   source_asset_id:data.assetId,
   provider:"elevenlabs",
   provider_voice_id:clone.voiceId,
   name:data.name,
   consent_confirmed:true,
   consent_text:"I confirm I have authorization to clone this speaker's voice.",
   status:clone.requiresVerification?"processing":"ready"
  }).select("id").single();
  if(cloneResult.error||!cloneResult.data?.id)throw new Error("Couldn't save clone.");
  cloneId=cloneResult.data.id;
  const voiceUpsert=await db.from("voices").upsert({
   provider:"elevenlabs",
   provider_voice_id:clone.voiceId,
   name:data.name,
   language:"en",
   category:"cloned",
   status:"active",
   metadata:{clone_id:cloneId}
  },{onConflict:"provider,provider_voice_id"});
  if(voiceUpsert.error)throw new Error("Couldn't register cloned voice.");
  completionAttempted=true;
  await doneJob(id,{cloneId,voiceId:clone.voiceId});
  return{ok:true,cloneId,voiceId:clone.voiceId};
 }catch(e:any){
  const message=e instanceof Error?e.message:"Voice cloning failed.";
  const outcome=await failJob(id,message,{
   completionMayHaveSucceeded:completionAttempted,
   cleanupAsset:createdVoiceId?async()=>{
    const failures:string[]=[];
    const voiceDelete=await db.from("voices").delete().eq("provider","elevenlabs").eq("provider_voice_id",createdVoiceId);
    if(voiceDelete.error)failures.push("cloned voice record");
    const cloneDelete=await db.from("voice_clones").delete().eq("user_id",context.userId).eq("project_id",data.projectId).eq("provider_voice_id",createdVoiceId);
    if(cloneDelete.error)failures.push("clone record");
    if(failures.length)throw new Error("Cleanup failed for "+failures.join(" and ")+".");
   }:undefined
  });
  if(outcome.completed&&cloneId&&createdVoiceId)return{ok:true,cloneId,voiceId:createdVoiceId};
  const providerWarning=createdVoiceId?" The provider may have created a remote voice clone; check the provider console if no clone appears in the app.":"";
  return{ok:false,error:outcome.error+providerWarning};
 }
});

export const generateMusicTrack=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),title:z.string().min(1).max(120),prompt:z.string().min(10).max(1000),durationSeconds:z.number().int().min(3).max(600),genre:z.string().max(80).optional(),mood:z.string().max(80).optional()}).parse(d)).handler(async({data,context})=>{
 const s:any=context.supabase;let id:string;try{id=await job(s,"generate_music",data.projectId,{prompt:data.prompt,durationSeconds:data.durationSeconds})}catch(e:any){return{ok:false,error:"Couldn't start music generation."}}
 try{const a=await musicProvider().compose({prompt:data.prompt,durationMs:data.durationSeconds*1000});const path=`${context.userId}/${data.projectId}/audio/music/${crypto.randomUUID()}.mp3`;const up=await db.storage.from("project-assets").upload(path,a.bytes,{contentType:a.contentType});if(up.error)throw new Error("Couldn't store music");const asset=(await db.from("assets").insert({project_id:data.projectId,kind:"music",name:data.title,storage_path:path,meta:{provider:"elevenlabs",provider_asset_id:a.providerAssetId}}).select("id").single()).data;if(!asset)throw new Error("Couldn't register music asset");const track=(await db.from("music_tracks").insert({project_id:data.projectId,asset_id:asset.id,title:data.title,genre:data.genre,mood:data.mood,duration_seconds:data.durationSeconds,license:"provider-generated",provider:"elevenlabs",provider_asset_id:a.providerAssetId,attribution:"Generated with ElevenLabs Music API"}).select("id").single()).data;await doneJob(id,{trackId:track?.id,assetId:asset.id,path});return{ok:true,trackId:track?.id,url:await url(path)}}catch(e:any){const message=e instanceof Error?e.message:"Audio generation failed.";const outcome=await failJob(id,message);return{ok:false,error:outcome.completed?"The job completed but its response could not be confirmed. Refresh the project to see the saved result.":outcome.error}}
});
