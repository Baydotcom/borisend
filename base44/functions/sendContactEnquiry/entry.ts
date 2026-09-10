import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const clean=(v:any,n=2000)=>String(v||'').trim().slice(0,n);
Deno.serve(async(req)=>{
  if(req.method!=='POST') return Response.json({error:'Method not allowed'},{status:405});
  try{
    const b=createClientFromRequest(req); const sr=b.asServiceRole; const x=await req.json().catch(()=>({}));
    if(x.website) return Response.json({success:true,reference_number:'BS-'+Date.now().toString(36).toUpperCase()});
    const full_name=clean(x.full_name,100), email=clean(x.email,254).toLowerCase(), subject=clean(x.subject,160), message=clean(x.message,2000), enquiry_type=clean(x.enquiry_type,80);
    if(!full_name||!/^\S+@\S+\.\S+$/.test(email)||!subject||message.length<20||x.consent_accepted!==true) return Response.json({error:'Please complete all required fields.'},{status:400});
    const me=await b.auth.me().catch(()=>null); const owner=me?.id||`guest:${email}`; const now=new Date().toISOString();
    const c=await sr.entities.CRMConversation.create({owner_user_id:owner,user_email:email,user_name:full_name,subject:`${subject}${enquiry_type?` · ${enquiry_type.replaceAll('_',' ')}`:''}`,status:'waiting_on_team',priority:'normal',last_message_at:now,last_message_preview:message.slice(0,180),unread_by_user:0,unread_by_admin:1});
    await sr.entities.CRMMessage.create({conversation_id:c.id,owner_user_id:owner,sender_type:'user',sender_user_id:me?.id||'',sender_name:full_name,sender_email:email,body:message,is_read_by_user:true,is_read_by_admin:false});
    const reference_number=`BS-${String(c.id).slice(-8).toUpperCase()}`;
    try{await sr.integrations.Core.SendEmail({to:'borisend@macpeniel.com',subject:`BoriSend CRM: ${subject}`,body:`New BoriSend enquiry\n\nReference: ${reference_number}\nFrom: ${full_name} <${email}>\nType: ${enquiry_type||'general'}\n\n${message}\n\nOpen the BoriSend Admin CRM to reply.`,from_name:'BoriSend'});}catch(e){console.warn('CRM admin email notification failed',e?.message);}
    return Response.json({success:true,reference_number});
  }catch(e){console.error(e);return Response.json({error:'Unable to submit your enquiry right now.'},{status:500});}
});