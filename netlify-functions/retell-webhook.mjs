/**
 * Retell AI Webhook Handler - Netlify Function (ES Modules)
 * Receives call_ended webhooks and triggers voice callback + email
 * Uses environment variables for credentials
 */

import twilio from 'twilio';

// Credentials from environment variables
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;
const DAVE_PHONE = process.env.DAVE_PHONE || '+19012315951';
const CALLBACK_FROM = process.env.CALLBACK_FROM || '+19016604277';
const MWS_AGENT_ID = process.env.MWS_AGENT_ID || 'agent_bd80eae90e5b19b7c2ef6ed1ab';

// Voice callback via Twilio
async function sendVoiceCall(toNumber, message) {
  const client = twilio(TWILIO_SID, TWILIO_AUTH);
  
  const escapedMsg = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Pause length="3"/>
    <Say voice="Polly.Matthew-Neural">${escapedMsg}</Say>
</Response>`;
  
  const call = await client.calls.create({
    twiml: twiml,
    to: toNumber,
    from: CALLBACK_FROM
  });
  
  return call.sid;
}

export default async (event, context) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const data = JSON.parse(event.body);
    const eventType = data.event;
    
    console.log(`Webhook received: ${eventType}`);
    
    // Only process call_ended
    if (eventType !== 'call_ended' && eventType !== 'call_analyzed') {
      return new Response(JSON.stringify({ status: 'ignored' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const call = data.call || data;
    const agentId = call.agent_id;
    const fromNumber = call.from_number || 'Unknown';
    const callId = call.call_id || 'unknown';
    
    // Extract caller info
    const analysis = call.call_analysis || call.post_call_analysis || {};
    const callerName = analysis.custom_analysis_data?.caller_name 
      || analysis.caller_name 
      || 'Unknown';
    const callerPhone = analysis.custom_analysis_data?.caller_phone 
      || analysis.caller_phone 
      || fromNumber;
    const serviceNeeded = analysis.custom_analysis_data?.service_needed 
      || analysis.service_needed 
      || analysis.call_summary 
      || 'Not specified';
    
    const durationMs = call.call_duration_ms || call.duration_ms || 0;
    const durationSec = Math.round(durationMs / 1000);
    const durationStr = durationSec > 0 
      ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` 
      : 'unknown';
    
    // Check if this is MWS agent
    if (agentId === MWS_AGENT_ID) {
      // Send voice callback to Dave
      const voiceMsg = `New lead from ${callerName}. They're interested in ${serviceNeeded.substring(0, 50)}. Callback number is ${callerPhone}. Call duration was ${durationStr}. Press 1 to hear this message again, or hang up to end the call.`;
      
      await sendVoiceCall(DAVE_PHONE, voiceMsg);
      
      console.log(`MWS notification sent for call ${callId}`);
    }
    
    return new Response(JSON.stringify({ status: 'notified', call_id: callId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
