// Note: no 'server-only' marker here — src/start.ts is isomorphic, and the
// function middleware below already runs exclusively on the server.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

type Bucket={started:number;count:number};
const buckets=new Map<string,Bucket>();
const WINDOW_MS=60_000;
const MAX=120;
const MAX_BUCKETS=10_000;

function clientKey(){
  const request=getRequest();
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

export const rateLimitServerFunctions=createMiddleware({type:"function"}).server(async({next})=>{
  const request=getRequest();
  const key=`${clientKey()}:${new URL(request.url).pathname}`;
  const now=Date.now();
  const bucket=buckets.get(key);
  if(!bucket || now-bucket.started>=WINDOW_MS){
    if(buckets.size>=MAX_BUCKETS) buckets.delete(buckets.keys().next().value as string);
    buckets.set(key,{started:now,count:1});
    return next();
  }
  bucket.count++;
  if(bucket.count>MAX){
    const retry=Math.max(1,Math.ceil((WINDOW_MS-(now-bucket.started))/1000));
    throw new Response("Too many requests",{status:429,headers:{"Retry-After":String(retry),"Cache-Control":"no-store"}});
  }
  return next();
});
