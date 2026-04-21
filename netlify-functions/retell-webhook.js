/**
 * Retell AI Webhook Handler - Netlify Function (CommonJS)
 * Receives call_ended webhooks and triggers voice callback
 */

const twilio = require('twilio');

exports.handler = async (event, context) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const eventType = data.event;
    
    console.log(`Webhook received: ${eventType}`);
    
    // Only process call_ended
    if (eventType !== 'call_ended' && eventType !== 'call_analyzed') {
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'ignored' })
      };
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
    if (agentId === process.env.MWS_AGENT_ID) {
      // Get credentials from env
      const TWILIO_SID = process.env.TWILIO_SID;
      const TWILIO_AUTH = process.env.TWILIO_AUTH;
      const DAVE_PHONE = process.env.DAVE_PHONE || '+19012315951';
      const CALLBACK_FROM = process.env.CALLBACK_FROM || '+19016604277';
      
      // Send voice callback to Dave
      const client = twilio(TWILIO_SID, TWILIO_AUTH);
      
      // Format phone number as spoken digits (each digit separated by space)
      const phoneDigits = callerPhone.replace(/\D/g, '').split('').join(' ');
      
      // Build the message
      const leadInfo = `New lead from ${callerName}. They're interested in ${serviceNeeded.substring(0, 50)}. Callback number is ${phoneDigits}. Call duration was ${durationStr}.`;
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Pause length="3"/>
    <Say voice="Polly.Matthew-Neural">${leadInfo}</Say>
    <Pause length="3"/>
    <Say voice="Polly.Matthew-Neural">I'll repeat that. ${leadInfo}</Say>
    <Pause length="3"/>
    <Say voice="Polly.Matthew-Neural">One more time. ${leadInfo}</Say>
</Response>`;
      
      await client.calls.create({
        twiml: twiml,
        to: DAVE_PHONE,
        from: CALLBACK_FROM
      });
      
      console.log(`MWS notification sent for call ${callId}`);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'notified', call_id: callId })
    };
    
  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
