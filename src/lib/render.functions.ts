import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {getRenderProvider,type RenderManifest} from "./render.providers.server";
import { claimRenderJobFinalization } from "./render-finalization";
import { cancelRenderJobWithProvider } from "./render-cancellation";
import { downloadRemoteMedia } from "./remote-media.server";
async function adm():Promise<any>{return (await import("@/integrations/supabase/client.server")).supabaseAdmin}
async function signManifest(admin:any,m:RenderManifest){
 const paths=new Set<string>();
 for (const asset of m.assets) { if (asset.storage_path) paths.add(asset.storage_path); }
 for (const scene of m.scenes) { if (scene.image_path) paths.add(scene.image_path); if (scene.clip_path) paths.add(scene.clip_path); }
 const list=[...paths];const urls=new Map<string,string>();
 if(list.length){const r=await admin.storage.from("project-assets").createSignedUrls(list,86400);if(r.error)throw new Error("Couldn't prepare project files for rendering");(r.data||[]).forEach((x:any)=>x.signedUrl&&x.path&&urls.set(x.path,x.signedUrl))}
 const missing=list.filter((path)=>!urls.has(path));
 if(missing.length)throw new Error("Couldn't sign all media files required for rendering.");
 m.assets.forEach((a:any)=>{a.url=urls.get(a.storage_path)});m.scenes.forEach((s:any)=>{s.image_url=s.image_path?urls.get(s.image_path):undefined;s.clip_url=s.clip_path?urls.get(s.clip_path):undefined});
}
async function buildManifest(s:any,projectId:string){
 const [p,t,c,cap,a,set,sc]=await Promise.all([
  s.from("projects").select("id,title,format,user_id").eq("id",projectId).maybeSingle(),
  s.from("timeline_tracks").select("*").eq("project_id",projectId).order("position"),
  s.from("timeline_clips").select("*").eq("project_id",projectId).order("start_seconds"),
  s.from("captions").select("*").eq("project_id",projectId).order("start_seconds"),
  s.from("assets").select("id,kind,name,storage_path,meta").eq("project_id",projectId),
  s.from("timeline_settings").select("*").eq("project_id",projectId).maybeSingle(),
  s.from("scenes").select("id,title,duration_seconds,position,image_path,clip_path,narration").eq("project_id",projectId).order("position")
 ]);
 if(p.error||!p.data)throw new Error("Project not found");
 if(t.error)throw t.error;if(c.error)throw c.error;if(cap.error)throw cap.error;if(a.error)throw a.error;if(set.error)throw set.error;if(sc.error)throw sc.error;
 const settings=set.data||{fps:30,width:p.data.format==="short"?1080:1920,height:p.data.format==="short"?1920:1080};
 return {project:p.data,manifest:{projectId,width:settings.width,height:settings.height,fps:settings.fps,format:p.data.format,scenes:sc.data||[],tracks:t.data||[],clips:c.data||[],captions:cap.data||[],assets:a.data||[]}} as {project:any;manifest:RenderManifest};
}
export const createRenderJob=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),presetId:z.string().uuid().optional()}).parse(d)).handler(async({data,context})=>{
 try{
  const s:any=context.supabase;const admin=await adm(); const {manifest}=await buildManifest(s,data.projectId); await signManifest(admin,manifest);
  let preset:any=null;
  if(data.presetId){
   const presetResult=await s.from("render_presets").select("*").eq("id",data.presetId).eq("project_id",data.projectId).maybeSingle();
   if(presetResult.error)throw new Error("Couldn't load the selected render preset.");
   preset=presetResult.data;
   if(!preset)throw new Error("Render preset not found in this project.");
  }
  if(preset){manifest.width=preset.width;manifest.height=preset.height;manifest.fps=preset.fps}
  const r=await s.from("render_jobs").insert({project_id:data.projectId,user_id:context.userId,preset_id:preset?.id||null,status:"queued",provider:"cloud",progress:0,input_manifest:manifest}).select("id").single();
  if(r.error||!r.data)throw r.error||new Error("Couldn't create render job");
  const jobId=r.data.id;
  const provider=getRenderProvider();
  if(!provider){
   const error="RENDER_PROVIDER_NOT_CONFIGURED: Configure SHOTSTACK_API_KEY or RENDERER_URL before starting a render.";
   const failed=await admin.from("render_jobs").update({status:"failed",error,finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId).eq("status","queued").select("id").maybeSingle();
   if(failed.error||!failed.data)return {ok:false,error:"Rendering is not configured, and the failed state could not be saved. Retry checking the render job."};
   return {ok:false,error:"Rendering is not configured yet. Set SHOTSTACK_API_KEY or RENDERER_URL and try again."};
  }
  let providerAcceptedId:string|undefined;
  try{
   const submitted=await provider.submit(manifest);
   providerAcceptedId=submitted.providerJobId;
   const patch={status:"processing",provider_job_id:submitted.providerJobId,started_at:new Date().toISOString(),updated_at:new Date().toISOString(),error:null};
   const persisted=await admin.from("render_jobs").update(patch).eq("id",jobId).eq("status","queued").select("id").maybeSingle();
   if(persisted.error||!persisted.data){
    const fresh=await admin.from("render_jobs").select("status,provider_job_id").eq("id",jobId).maybeSingle();
    if(!fresh.error&&fresh.data?.provider_job_id===submitted.providerJobId)return {ok:true,jobId,dispatched:true,message:"Render dispatched."};
    const reason="Renderer accepted the request, but the provider job ID could not be confirmed in the database.";
    const failed=await admin.from("render_jobs").update({status:"failed",error:reason,finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId).in("status",["queued","processing"]).select("id").maybeSingle();
    if(failed.error)return {ok:false,error:reason+" Job tracking needs admin reconciliation."};
    return {ok:false,error:reason+" Render job ID: "+jobId};
   }
   return {ok:true,jobId,dispatched:true,message:"Render dispatched."};
  }catch(e:any){
   const message=e instanceof Error?e.message:"Render dispatch failed.";
   const fresh=providerAcceptedId?await admin.from("render_jobs").select("provider_job_id").eq("id",jobId).maybeSingle():null;
   if(providerAcceptedId&&!fresh?.error&&fresh?.data?.provider_job_id===providerAcceptedId)return {ok:true,jobId,dispatched:true,message:"Render dispatched."};
   const failed=await admin.from("render_jobs").update({status:"failed",error:message,finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId).in("status",["queued","processing"]).select("id").maybeSingle();
   if(failed.error)return {ok:false,error:"Render dispatch failed and its failed state could not be saved."};
   return {ok:false,error:message};
  }
 }catch(e:any){return{ok:false,error:e.message||"Couldn't create render job."}}
});
export const getRenderJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s: any = context.supabase;
    const admin = await adm();
    const result = await s.from("render_jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("project_id", data.projectId)
      .maybeSingle();

    if (result.error || !result.data) return { ok: false, error: "Render job not found." };
    const job: any = result.data;
    if (!job.provider_job_id || ["failed", "cancelled"].includes(job.status)) return { ok: true, job };

    if (job.status === "completed") {
      const savedExport = await admin.from("exports").select("id").eq("render_job_id", job.id).maybeSingle();
      if (savedExport.error) return { ok: false, error: "Couldn't verify the finished export." };
      if (savedExport.data) return { ok: true, job };
      // Recover legacy rows marked completed before their export was persisted.
    }

    const provider = getRenderProvider();
    if (!provider) {
      const error = "RENDER_PROVIDER_NOT_CONFIGURED: Configure SHOTSTACK_API_KEY or RENDERER_URL.";
      const patch = { status: "failed", error, finished_at: new Date().toISOString(), finalization_started_at: null, updated_at: new Date().toISOString() };
      const failed = await admin.from("render_jobs").update(patch).eq("id", job.id).in("status", ["queued", "processing", "completed"]).select("id").maybeSingle();
      if (failed.error) return { ok: false, error: "Could not save the render configuration failure." };
      Object.assign(job, patch);
      return { ok: true, job };
    }

    let statusReceived = false;
    let finalizationClaimed = false;
    try {
      const status = await provider.status(job.provider_job_id);
      statusReceived = true;
      const progress = Math.max(0, Math.min(100, Number.isFinite(status.progress) ? status.progress : 0));

      if (status.status === "failed") {
        const patch = {
          status: "failed",
          progress,
          error: status.error || "Renderer failed the job.",
          finished_at: new Date().toISOString(),
          finalization_started_at: null,
          updated_at: new Date().toISOString(),
        };
        const failed = await admin.from("render_jobs").update(patch).eq("id", job.id).in("status", ["queued", "processing", "completed"]).select("id").maybeSingle();
        if (failed.error) return { ok: false, error: "Couldn't save the renderer failure state. Retry the status check." };
        if (!failed.data) {
          const fresh = await admin.from("render_jobs").select("*").eq("id", job.id).maybeSingle();
          return fresh.error || !fresh.data ? { ok: false, error: "Render job not found." } : { ok: true, job: fresh.data };
        }
        Object.assign(job, patch);
        return { ok: true, job };
      }

      if (status.status !== "completed") {
        const patch = {
          status: status.status,
          progress,
          error: status.error || null,
          finished_at: null,
          updated_at: new Date().toISOString(),
        };
        const written = await admin.from("render_jobs").update(patch).eq("id", job.id).in("status", ["queued", "processing", "completed"]).select("id").maybeSingle();
        if (written.error) return { ok: false, error: "Couldn't save the current render status." };
        if (!written.data) {
          const fresh = await admin.from("render_jobs").select("*").eq("id", job.id).maybeSingle();
          return fresh.error || !fresh.data ? { ok: false, error: "Render job not found." } : { ok: true, job: fresh.data };
        }
        Object.assign(job, patch);
        return { ok: true, job };
      }

      if (!status.outputUrl) throw new Error("Renderer marked the job complete but returned no output URL.");

      const preparing = {
        status: "processing",
        progress: 95,
        error: null,
        finished_at: null,
        updated_at: new Date().toISOString(),
      };
      const preparingResult = await admin.from("render_jobs").update(preparing).eq("id", job.id).in("status", ["queued", "processing", "completed"]).select("id").maybeSingle();
      if (preparingResult.error) return { ok: false, error: "Couldn't save the render finalization state." };
      if (!preparingResult.data) {
        const fresh = await admin.from("render_jobs").select("*").eq("id", job.id).maybeSingle();
        return fresh.error || !fresh.data ? { ok: false, error: "Render job not found." } : { ok: true, job: fresh.data };
      }
      Object.assign(job, preparing);

      let claimState: string;
      try {
        claimState = await claimRenderJobFinalization(
          (args) => admin.rpc("claim_render_job_finalization", args),
          job.id,
        );
      } catch {
        job.error = "Couldn't claim export finalization. Retry polling the render job.";
        return { ok: false, error: job.error };
      }

      if (claimState === "busy") return { ok: true, job };
      if (claimState === "not_found") return { ok: false, error: "Render job not found." };
      if (claimState === "not_active") {
        const fresh = await admin.from("render_jobs").select("*").eq("id", job.id).maybeSingle();
        return fresh.error || !fresh.data ? { ok: false, error: "Render job not found." } : { ok: true, job: fresh.data };
      }
      if (claimState === "already_complete") {
        const fresh = await admin.from("render_jobs").select("*").eq("id", job.id).maybeSingle();
        return fresh.error || !fresh.data ? { ok: false, error: "Render job not found." } : { ok: true, job: fresh.data };
      }
      finalizationClaimed = true;

      const existing = await admin.from("exports").select("id").eq("render_job_id", job.id).maybeSingle();
      if (existing.error) throw new Error("Couldn't check whether the export already exists.");
      if (existing.data) {
        const completePatch = {
          status: "completed",
          progress: 100,
          error: null,
          finalization_started_at: null,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const complete = await admin.from("render_jobs").update(completePatch).eq("id", job.id).select("id").maybeSingle();
        if (complete.error || !complete.data) throw new Error("The export exists but the render completion state could not be saved.");
        Object.assign(job, completePatch);
        return { ok: true, job };
      }

      const downloaded = await downloadRemoteMedia(status.outputUrl, {
        timeoutMs: 120_000,
        maxBytes: 512 * 1024 * 1024,
        allowedContentTypes: ["video/mp4", "application/octet-stream"],
      });
      const bytes = Buffer.from(downloaded.bytes);
      const path = String(job.user_id) + "/" + String(data.projectId) + "/exports/" + String(job.id) + ".mp4";
      const storage = admin.storage.from("project-assets");
      const upload = await storage.upload(path, bytes, { contentType: "video/mp4", upsert: true });
      if (upload.error) throw new Error("Couldn't store rendered export.");

      let assetId: string | undefined;
      let assetInsertAttempted = false;
      try {
        assetInsertAttempted = true;
        const assetResult = await admin.from("assets").insert({
          project_id: data.projectId,
          kind: "video",
          name: "Export " + String(job.id) + ".mp4",
          storage_path: path,
          meta: { render_job_id: job.id },
        }).select("id").single();
        if (assetResult.error || !assetResult.data?.id) throw new Error("Couldn't register the rendered export asset.");
        assetId = assetResult.data.id;

        const exportResult = await admin.from("exports").insert({
          project_id: data.projectId,
          render_job_id: job.id,
          asset_id: assetId,
          format: "mp4",
          storage_path: path,
          filename: "export-" + String(job.id) + ".mp4",
          size_bytes: bytes.length,
          width: job.input_manifest?.width,
          height: job.input_manifest?.height,
          fps: job.input_manifest?.fps,
          status: "ready",
        }).select("id").single();
        if (exportResult.error || !exportResult.data?.id) {
          const check = await admin.from("exports").select("id").eq("render_job_id", job.id).maybeSingle();
          if (check.error) throw new Error("The export write outcome is unknown; media was preserved for reconciliation.");
          if (!check.data) throw new Error("Couldn't save the export record.");
        }
      } catch (persistError) {
        const exportCheck = await admin.from("exports").select("id").eq("render_job_id", job.id).maybeSingle();
        if (exportCheck.error || exportCheck.data) throw persistError;

        let cleanupSafe = true;
        let cleanupAssetId = assetId;
        if (!cleanupAssetId && assetInsertAttempted) {
          const lookup = await admin.from("assets").select("id").eq("project_id", data.projectId).eq("storage_path", path).maybeSingle();
          if (lookup.error) cleanupSafe = false;
          else cleanupAssetId = lookup.data?.id;
        }
        if (cleanupSafe && cleanupAssetId) {
          const deleted = await admin.from("assets").delete().eq("id", cleanupAssetId);
          if (deleted.error) cleanupSafe = false;
        }
        if (cleanupSafe) {
          const removed = await storage.remove([path]);
          if (removed.error) throw new Error("Export persistence failed and the uploaded file could not be removed.");
        } else {
          throw new Error("Export persistence failed; media was preserved because asset cleanup could not be confirmed.");
        }
        throw persistError;
      }

      const completePatch = {
        status: "completed",
        progress: 100,
        error: null,
        finalization_started_at: null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const complete = await admin.from("render_jobs").update(completePatch).eq("id", job.id).select("id").maybeSingle();
      if (complete.error || !complete.data) throw new Error("Export is saved but render completion needs reconciliation.");
      Object.assign(job, completePatch);
      return { ok: true, job };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Render status check failed.";
      if (finalizationClaimed) {
        const existing = await admin.from("exports").select("id").eq("render_job_id", job.id).maybeSingle();
        if (existing.error) {
          job.status = "processing";
          job.error = "Export finalization outcome could not be confirmed. Retry polling and check the exports list.";
          return { ok: true, job };
        }
        if (existing.data) {
          const completePatch = {
            status: "completed",
            progress: 100,
            error: null,
            finalization_started_at: null,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const complete = await admin.from("render_jobs").update(completePatch).eq("id", job.id).select("id").maybeSingle();
          if (!complete.error && complete.data) Object.assign(job, completePatch);
          else {
            job.status = "processing";
            job.error = "The export is saved, but render status reconciliation is still required.";
          }
          return { ok: true, job };
        }
        const retryablePatch = { status: "processing", error: message, updated_at: new Date().toISOString() };
        const retryable = await admin.from("render_jobs").update(retryablePatch).eq("id", job.id).eq("status", "processing").select("id").maybeSingle();
        Object.assign(job, retryablePatch);
        if (retryable.error) job.error = "Export finalization needs retry; database state could not be updated.";
        return { ok: true, job };
      }

      if (!statusReceived) return { ok: false, error: "Couldn't check renderer status. Retry the status poll." };
      const failedPatch = {
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        finalization_started_at: null,
        updated_at: new Date().toISOString(),
      };
      const failed = await admin.from("render_jobs").update(failedPatch).eq("id", job.id).in("status", ["queued", "processing", "completed"]).select("id").maybeSingle();
      if (failed.error) return { ok: false, error: "Couldn't save the render failure state. Retry the status check." };
      if (!failed.data) {
        const fresh = await admin.from("render_jobs").select("*").eq("id", job.id).maybeSingle();
        return fresh.error || !fresh.data ? { ok: false, error: "Render job not found." } : { ok: true, job: fresh.data };
      }
      Object.assign(job, failedPatch);
      return { ok: true, job };
    }
  });
export const cancelRenderJob=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),jobId:z.string().uuid()}).parse(d)).handler(async({data,context})=>{
 const session:any=context.supabase;
 const jobResult=await session.from("render_jobs")
  .select("id,project_id,user_id,status,provider_job_id,finalization_started_at")
  .eq("id",data.jobId).eq("project_id",data.projectId).eq("user_id",context.userId).maybeSingle();
 if(jobResult.error||!jobResult.data)return{ok:false,error:"Render job not found."};

 const admin=await adm();
 return cancelRenderJobWithProvider(
  jobResult.data,
  getRenderProvider(),
  async()=>await admin.from("render_jobs")
   .update({status:"cancelled",updated_at:new Date().toISOString(),finished_at:new Date().toISOString()})
   .eq("id",data.jobId).eq("project_id",data.projectId).eq("user_id",context.userId)
   .in("status",["queued","processing"]).is("finalization_started_at",null)
   .select("id").maybeSingle(),
 );
});
export const getExportUrl=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),exportId:z.string().uuid()}).parse(d)).handler(async({data,context})=>{const s:any=context.supabase; const e=(await s.from("exports").select("storage_path,filename,status").eq("id",data.exportId).eq("project_id",data.projectId).maybeSingle()).data;if(!e?.storage_path||e.status!=="ready")return{ok:false,error:"Export is not ready."};const r=await s.storage.from("project-assets").createSignedUrl(e.storage_path,900);if(r.error)return{ok:false,error:r.error.message};return{ok:true,url:r.data.signedUrl,filename:e.filename}});
