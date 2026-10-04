export type RenderManifest = {
  projectId:string; width:number; height:number; fps:number; format:string;
  scenes:any[]; tracks:any[]; clips:any[]; captions:any[]; assets:any[];
};
export type RenderSubmitResult={providerJobId:string};
export type RenderStatus={status:"queued"|"processing"|"completed"|"failed";progress:number;outputUrl?:string;error?:string};
export interface RenderProvider{submit(manifest:RenderManifest):Promise<RenderSubmitResult>;status(providerJobId:string):Promise<RenderStatus>}
export class HttpRenderProvider implements RenderProvider{
 constructor(private baseUrl:string,private apiKey?:string){}
 private headers(){return {"Content-Type":"application/json",...(this.apiKey?{Authorization:`Bearer ${this.apiKey}`}:{})}}
 async submit(manifest:RenderManifest){const r=await fetch(`${this.baseUrl.replace(/\/$/,"")}/jobs`,{method:"POST",headers:this.headers(),body:JSON.stringify({manifest})});if(!r.ok)throw new Error(`Renderer submit failed (${r.status})`);const j:any=await r.json();if(!j.id&&!j.jobId)throw new Error("Renderer returned no job id");return{providerJobId:j.id||j.jobId}}
 async status(id:string):Promise<RenderStatus>{const r=await fetch(`${this.baseUrl.replace(/\/$/,"")}/jobs/${encodeURIComponent(id)}`,{headers:this.headers()});if(!r.ok)throw new Error(`Renderer status failed (${r.status})`);const j:any=await r.json();const raw=String(j.status||"processing");const status=raw==="succeeded"||raw==="success"?"completed":raw==="error"?"failed":raw==="queued"?"queued":"processing" as const;return{status,progress:Number(j.progress??0),outputUrl:j.output_url||j.outputUrl||j.url,error:j.error?.message||j.error}}
}
export function getRenderProvider(){const url=process.env["RENDERER_URL"];if(!url) return null;return new HttpRenderProvider(url,process.env["RENDERER_API_KEY"])}
