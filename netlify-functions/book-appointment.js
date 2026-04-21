/**
 * MWS Webhook - Handles Cal.com booking via Retell agent
 * Simplified version for initial deployment
 */

exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ 
      status: 'ok',
      message: 'MWS booking webhook is live',
      timestamp: new Date().toISOString()
    })
  };
};
