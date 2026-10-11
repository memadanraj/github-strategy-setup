import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {getRenderProvider,type RenderManifest} from "./render.providers.server";
import { downloadRemoteMedia } from "./remote-media.server";
async function adm():Promise<any>{return (await import("@/integrations/supabase/client.server")).supabaseAdmin}
async function signManifest(admin:any,m:RenderManifest){
 const paths=new Set<string>();
 for (const asset of m.assets) { if (asset.storage_path) paths.add(asset.storage_path); }
 for (const scene of m.scenes) { if (scene.image_path) paths.add(scene.image_path); if (scene.clip_path) paths.add(scene.clip_path); }
 const list=[...paths];const urls=new Map<string,string>();
 if(list.length){const r=await admin.storage.from("project-assets").createSignedUrls(list,86400);if(r.error)throw new Error("Couldn't prepare project files for rendering");(r.data||[]).forEach((x:any)=>x.signedUrl&&x.path&&urls.set(x.path,x.signedUrl))}
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
 if(t.error)throw t.error;if(c.error)throw c.error;if(cap.error)throw cap.error;if(a.error)throw a.error;if(sc.error)throw sc.error;
 const settings=set.data||{fps:30,width:p.data.format==="short"?1080:1920,height:p.data.format==="short"?1920:1080};
 return {project:p.data,manifest:{projectId,width:settings.width,height:settings.height,fps:settings.fps,format:p.data.format,scenes:sc.data||[],tracks:t.data||[],clips:c.data||[],captions:cap.data||[],assets:a.data||[]}} as {project:any;manifest:RenderManifest};
}
export const createRenderJob=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),presetId:z.string().uuid().optional()}).parse(d)).handler(async({data,context})=>{
 try{
  const s:any=context.supabase;const admin=await adm(); const {manifest}=await buildManifest(s,data.projectId); await signManifest(admin,manifest);
  const preset=data.presetId?((await s.from("render_presets").select("*").eq("id",data.presetId).eq("project_id",data.projectId).maybeSingle()).data):null;
  if(preset){manifest.width=preset.width;manifest.height=preset.height;manifest.fps=preset.fps}
  const r=await s.from("render_jobs").insert({project_id:data.projectId,user_id:context.userId,preset_id:preset?.id||null,status:"queued",provider:"cloud",progress:0,input_manifest:manifest}).select("id").single();
  if(r.error||!r.data)throw r.error||new Error("Couldn't create render job");
  const jobId=r.data.id;
  const provider=getRenderProvider();
  if(!provider){
   const error="RENDER_PROVIDER_NOT_CONFIGURED: Configure SHOTSTACK_API_KEY or RENDERER_URL before starting a render.";
   await admin.from("render_jobs").update({status:"failed",error,finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId);
   return {ok:false,error:"Rendering is not configured yet. Set SHOTSTACK_API_KEY or RENDERER_URL and try again."};
  }
  try{const submitted=await provider.submit(manifest);await admin.from("render_jobs").update({status:"processing",provider_job_id:submitted.providerJobId,started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId);return{ok:true,jobId,dispatched:true,message:"Render dispatched."}}
  catch(e:any){await admin.from("render_jobs").update({status:"failed",error:e.message,finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId);return{ok:false,error:e.message}}
 }catch(e:any){return{ok:false,error:e.message||"Couldn't create render job."}}
});
export const getRenderJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s: any = context.supabase;
    const admin = await adm();
    const result = await s
      .from("render_jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("project_id", data.projectId)
      .maybeSingle();

    if (result.error || !result.data) {
      return { ok: false, error: "Render job not found." };
    }

    const job: any = result.data;
    if (!job.provider_job_id || !["processing", "queued"].includes(job.status)) {
      return { ok: true, job };
    }

    const provider = getRenderProvider();
    if (!provider) {
      const error = "RENDER_PROVIDER_NOT_CONFIGURED: Configure SHOTSTACK_API_KEY or RENDERER_URL.";
      await admin.from("render_jobs").update({
        status: "failed",
        error,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      job.status = "failed";
      job.error = "Rendering is not configured.";
      return { ok: true, job };
    }

    try {
      const status = await provider.status(job.provider_job_id);
      const isTerminal = ["completed", "failed"].includes(status.status);
      const patch = {
        status: status.status,
        progress: Math.max(0, Math.min(100, Number.isFinite(status.progress) ? status.progress : 0)),
        error: status.error || null,
        finished_at: isTerminal ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      const { error: statusWriteError } = await admin
        .from("render_jobs")
        .update(patch)
        .eq("id", job.id);
      if (statusWriteError) throw new Error("Couldn't save render status.");

      Object.assign(job, patch);

      if (status.status !== "completed") return { ok: true, job };
      if (!status.outputUrl) throw new Error("Renderer marked the job complete but returned no output URL.");

      const existing = await admin
        .from("exports")
        .select("id")
        .eq("render_job_id", job.id)
        .maybeSingle();
      if (existing.error) throw new Error("Couldn't check whether the export already exists.");
      if (existing.data) return { ok: true, job };

      const downloaded = await downloadRemoteMedia(status.outputUrl, {
        timeoutMs: 120_000,
        maxBytes: 512 * 1024 * 1024,
        allowedContentTypes: ["video/mp4", "application/octet-stream"],
      });
      const bytes = Buffer.from(downloaded.bytes);
      const path = `${job.user_id}/${data.projectId}/exports/${job.id}.mp4`;
      const storage = admin.storage.from("project-assets");
      const upload = await storage.upload(path, bytes, {
        contentType: "video/mp4",
        upsert: true,
      });
      if (upload.error) throw new Error("Couldn't store rendered export.");

      let assetId: string | undefined;
      try {
        const assetResult = await admin.from("assets").insert({
          project_id: data.projectId,
          kind: "video",
          name: `Export ${job.id}.mp4`,
          storage_path: path,
          meta: { render_job_id: job.id },
        }).select("id").single();

        if (assetResult.error || !assetResult.data?.id) {
          throw new Error("Couldn't register the rendered export asset.");
        }
        assetId = assetResult.data.id;

        const exportResult = await admin.from("exports").insert({
          project_id: data.projectId,
          render_job_id: job.id,
          asset_id: assetId,
          format: "mp4",
          storage_path: path,
          filename: `export-${job.id}.mp4`,
          size_bytes: bytes.length,
          width: job.input_manifest?.width,
          height: job.input_manifest?.height,
          fps: job.input_manifest?.fps,
          status: "ready",
        });
        if (exportResult.error) throw new Error("Couldn't save the export record.");
      } catch (persistError) {
        if (assetId) await admin.from("assets").delete().eq("id", assetId);
        await storage.remove([path]);
        throw persistError;
      }

      return { ok: true, job };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Render status check failed.";
      await admin.from("render_jobs").update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      job.status = "failed";
      job.error = message;
      return { ok: true, job };
    }
  });
export const cancelRenderJob=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),jobId:z.string().uuid()}).parse(d)).handler(async({data,context})=>{const s:any=context.supabase; const r=await s.from("render_jobs").update({status:"cancelled",updated_at:new Date().toISOString(),finished_at:new Date().toISOString()}).eq("id",data.jobId).eq("project_id",data.projectId).in("status",["queued","processing"]);if(r.error)return{ok:false,error:r.error.message};return{ok:true}});
export const getExportUrl=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>z.object({projectId:z.string().uuid(),exportId:z.string().uuid()}).parse(d)).handler(async({data,context})=>{const s:any=context.supabase; const e=(await s.from("exports").select("storage_path,filename,status").eq("id",data.exportId).eq("project_id",data.projectId).maybeSingle()).data;if(!e?.storage_path||e.status!=="ready")return{ok:false,error:"Export is not ready."};const r=await s.storage.from("project-assets").createSignedUrl(e.storage_path,900);if(r.error)return{ok:false,error:r.error.message};return{ok:true,url:r.data.signedUrl,filename:e.filename}});
