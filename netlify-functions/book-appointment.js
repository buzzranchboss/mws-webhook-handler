/**
 * MWS Webhook - Handles Cal.com booking via Retell agent
 * Supports: check_availability, book_appointment
 */

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const toolName = body.tool_name || body.name;
    const parameters = body.parameters || body.args || {};

    console.log(`Tool called: ${toolName}`);
    console.log('Parameters:', JSON.stringify(parameters));

    if (toolName === 'check_availability') {
      return await checkAvailability(parameters);
    }

    if (toolName === 'book_appointment') {
      return await bookAppointment(parameters);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ error: 'Unknown tool', tool_name: toolName })
    };

  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function checkAvailability(params) {
  // Cal.com v2 API doesn't have a simple slots endpoint
  // Instead, we guide the caller to pick a time and try to book it
  return {
    statusCode: 200,
    body: JSON.stringify({
      available: true,
      response_to_customer: "I can schedule your AI Assessment for you. What day and time works best? I have availability weekdays between 9 AM and 5 PM Central Time. Each appointment is 45 minutes."
    })
  };
}

async function bookAppointment(params) {
  const CAL_API_KEY = process.env.CAL_API_KEY;
  const EVENT_TYPE_ID = process.env.EVENT_TYPE_ID || '5428433';

  const { name, email, phone, datetime } = params;

  if (!name || !email || !datetime) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        response_to_customer: "I need your name, email address, and preferred appointment time to book. What's your email address?"
      })
    };
  }

  const response = await fetch('https://api.cal.com/v2/bookings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CAL_API_KEY}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-06-14'
    },
    body: JSON.stringify({
      eventTypeId: parseInt(EVENT_TYPE_ID),
      start: datetime,
      timeZone: 'America/Chicago',
      language: 'en',
      responses: {
        name: name,
        email: email,
        phone: phone || ''
      },
      metadata: {
        source: 'AI Receptionist'
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Cal.com booking error:', data);

    // Check for specific errors
    const errorMsg = data.error?.message || data.message || 'That time slot may not be available.';

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        response_to_customer: `I wasn't able to book that time. ${errorMsg} Would you like to try a different day or time?`
      })
    };
  }

  const bookedTime = new Date(datetime).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short'
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      booking_id: data.id || data.booking?.id,
      response_to_customer: `Perfect! I've booked your AI Assessment for ${bookedTime}. You'll receive a confirmation email shortly at ${email}. Is there anything else I can help you with?`
    })
  };
}
