/**
 * Retell AI Webhook Handler - Netlify Function (CommonJS)
 * Receives call_ended webhooks and sends email notification
 */

const nodemailer = require('nodemailer');

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
      // Get email credentials from env
      const EMAIL_USER = process.env.EMAIL_USER;
      const EMAIL_PASS = process.env.EMAIL_PASS;
      const EMAIL_TO = process.env.EMAIL_TO || 'buzzranchboss@gmail.com';
      
      // Create email transporter
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS // App password, not regular password
        }
      });
      
      // Build email content
      const subject = `New Lead: ${callerName} - ${serviceNeeded.substring(0, 30)}`;
      const body = `
New lead from Memphis Web Solutions AI Receptionist!

Name: ${callerName}
Phone: ${callerPhone}
Service: ${serviceNeeded}
Call Duration: ${durationStr}
Call ID: ${callId}

Call them back ASAP!
      `.trim();
      
      // Send email
      await transporter.sendMail({
        from: EMAIL_USER,
        to: EMAIL_TO,
        subject: subject,
        text: body
      });
      
      console.log(`Lead notification email sent for call ${callId}`);
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
