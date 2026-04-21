/**
 * Replay Message Handler - Netlify Function
 * Handles keypress from Dave's callback to replay the lead message
 */

exports.handler = async (event, context) => {
  // Parse the keypress from Twilio
  const params = new URLSearchParams(event.body || '');
  const digits = params.get('Digits') || params.get('digits');
  
  console.log(`Replay request, digits: ${digits}`);
  
  // If user pressed 1, replay the message
  if (digits === '1') {
    // Get the original message from the request (Twilio passes CallSid, etc.)
    // We need to store the message somewhere or pass it as a parameter
    // For now, redirect back with a loop count
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather numDigits="1" timeout="10" action="https://mws-webhook.netlify.app/.netlify/functions/replay-message" method="POST">
        <Say voice="Polly.Matthew-Neural">Replaying message. Press 1 to hear it again, or hang up to end.</Say>
        <Pause length="2"/>
        <Say voice="Polly.Matthew-Neural">This is a replay. The original message details were from the webhook call. Please check your notes or hang up.</Say>
    </Gather>
    <Say voice="Polly.Matthew-Neural">Goodbye.</Say>
</Response>`;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: twiml
    };
  }
  
  // Any other key or timeout, say goodbye
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Matthew-Neural">Goodbye.</Say>
</Response>`;
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml' },
    body: twiml
  };
};
