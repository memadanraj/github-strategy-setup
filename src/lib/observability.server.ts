import '@tanstack/react-start/server-only';

function getDsn(){
  return process.env["SENTRY_DSN"];
}

export async function reportServerError(error:unknown, context:Record<string,unknown>={}){
  const dsn=getDsn();
  const message=error instanceof Error ? error.message : String(error);
  const stack=error instanceof Error ? error.stack : undefined;
  console.error("[observability]",{message,stack,...context});
  if(!dsn) return;

  try{
    const url=new URL(dsn);
    const projectId=url.pathname.split("/").filter(Boolean).pop();
    const publicKey=url.username;
    if(!projectId||!publicKey) return;
    const eventId=crypto.randomUUID().replaceAll("-","");
    const event={
      event_id:eventId,
      timestamp:Date.now()/1000,
      platform:"javascript",
      level:"error",
      message:{message},
      exception:stack?{values:[{type:error instanceof Error?error.constructor.name:"Error",value:message,stacktrace:{frames:[]},mechanism:{handled:false}}]}:undefined,
      tags:{service:"reelforge-server"},
      extra:context,
      server_name:process.env["APP_NAME"]||"reelforge",
    };
    const envelope=`${JSON.stringify({event_id:eventId,sdk:{name:"reelforge-server",version:"1.0.0"}})}\n${JSON.stringify({type:"event"})}\n${JSON.stringify(event)}`;
    const endpoint=`${url.origin}${url.pathname.substring(0,url.pathname.lastIndexOf("/"))}/envelope/`;
    await fetch(endpoint,{
      method:"POST",
      headers:{
        "Content-Type":"application/x-sentry-envelope",
        "X-Sentry-Auth":`Sentry sentry_version=7,sentry_key=${publicKey},sentry_client=reelforge-server/1.0.0`,
      },
      body:envelope,
    });
  }catch(reportingError){
    console.error("[observability] Sentry reporting failed",reportingError);
  }
}
