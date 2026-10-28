const fs = require('fs');const path = require('path');
const knowledge = JSON.parse(fs.readFileSync(path.join(__dirname,'..','knowledge.json'),'utf8'));
module.exports = async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'POST only'});
 if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'AI assistant not configured'});
 const {message,history=[]}=req.body||{};
 if(typeof message!=='string'||!message.trim()||message.length>1200) return res.status(400).json({error:'Invalid question'});
 if(/\b(?:ssn|social security|date of birth|dob|mrn|medical record number)\b/i.test(message)) return res.status(400).json({error:'Do not include patient information'});
 const ctx=knowledge.map(s=>`${s.title} (${s.timestamp}): ${s.intro}\n${s.steps.map((v,i)=>`${i+1}. ${v}`).join('\n')}`).join('\n\n');
 const prompt=`You are a friendly PracticeEHR training companion. Answer ONLY from the supplied training guide below, not from assumptions about actual UI buttons. Be concise, actionable, numbered steps (usually 2-5). If guide does not establish a step, clearly say it is not confirmed and advise checking with a trainer or practice admin. Never diagnose or give medical advice. Do not ask for or accept any patient-identifiable information. Never imply you can see the user's account, recording, screen, or chart. No external links unless already in guide.\n\nGUIDE:\n${ctx}`;
 const previous=Array.isArray(history)?history.slice(-6).filter(x=>['user','assistant'].includes(x.role)&&typeof x.content==='string'&&x.content.length<1300):[];
 try{
 const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',instructions:prompt,input:[...previous,{role:'user',content:message}],max_output_tokens:450,store:false})});
 if(!upstream.ok) throw new Error('Upstream request failed: '+upstream.status);
 const data=await upstream.json();const answer=(data.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n').trim();return res.status(200).json({answer:answer||'No response returned. Please consult the guide.'});
 }catch(e){return res.status(502).json({error:'AI temporarily unavailable. Use the built-in guide search.'})}
};