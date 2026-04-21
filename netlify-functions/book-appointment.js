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
  const CAL_API_KEY = process.env.CAL_API_KEY;
  const EVENT_TYPE_ID = process.env.EVENT_TYPE_ID || '5428433';

  const now = new Date();
  const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const url = `https://api.cal.com/v2/slots?eventTypeId=${EVENT_TYPE_ID}&start=${now.toISOString()}&end=${weekLater.toISOString()}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CAL_API_KEY}`,
      'cal-api-version': '2024-06-14'
    }
  });

  const data = await response.json();

  if (!data.slots || data.slots.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        available: false,
        response_to_customer: "I don't have any available appointments in the next 7 days. Would you like me to take your information and have Dave call you back to schedule?"
      })
    };
  }

  // Return first 5 available slots
  const slots = data.slots.slice(0, 5).map(s => {
    const time = s.time || s.start;
    const date = new Date(time);
    return {
      time: time,
      formatted: date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago'
      })
    };
  });

  const slotList = slots.map(s => s.formatted).join('; ');

  return {
    statusCode: 200,
    body: JSON.stringify({
      available: true,
      slots: slots,
      response_to_customer: `I have these times available: ${slotList}. Which works best for you?`
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
        response_to_customer: "I need your name, email, and preferred time to book the appointment. Can you provide those?"
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
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        response_to_customer: `I wasn't able to book that time. ${data.message || 'Please try a different time.'}`
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
      response_to_customer: `Perfect! I've booked your AI Assessment for ${bookedTime}. You'll receive a confirmation email shortly. Is there anything else I can help you with?`
    })
  };
}
