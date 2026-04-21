/**
 * MWS Webhook - Handles Cal.com booking via Retell agent
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
    console.log(`Parameters:`, parameters);
    
    // Check availability
    if (toolName === 'check_availability') {
      return await checkAvailability(parameters);
    }
    
    // Book appointment
    if (toolName === 'book_appointment') {
      return await bookAppointment(parameters);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ error: 'Unknown tool' })
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
  
  // Get available slots for the next 7 days
  const response = await fetch(`https://api.cal.com/v2/slots?eventTypeId=${EVENT_TYPE_ID}&start=${new Date().toISOString()}&end=${new Date(Date.now() + 7*24*60*60*1000).toISOString()}`, {
    headers: {
      'Authorization': `Bearer ${CAL_API_KEY}`,
      'cal-api-version': '2024-06-14'
    }
  });
  
  const data = await response.json();
  
  if (!data.slots || data.slots.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ available: false, message: 'No available slots in the next 7 days.' })
    };
  }
  
  // Return first 5 available slots
  const availableSlots = data.slots.slice(0, 5).map(s => ({
    time: s.time || s.start,
    formatted: new Date(s.time || s.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }));
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      available: true,
      slots: availableSlots,
      message: `Available times: ${availableSlots.map(s => s.formatted).join(', ')}`
    })
  };
}

async function bookAppointment(params) {
  const CAL_API_KEY = process.env.CAL_API_KEY;
  const EVENT_TYPE_ID = process.env.EVENT_TYPE_ID || '5428433';
  
  const { name, email, phone, datetime } = params;
  
  // Book via Cal.com API
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
        phone: phone
      },
      metadata: {
        source: 'AI Receptionist'
      }
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: false, 
        error: data.message || 'Booking failed',
        response_to_customer: `I'm sorry, I couldn't book that appointment. Please try a different time.`
      })
    };
  }
  
  const bookedTime = new Date(datetime).toLocaleString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit',
    timeZoneName: 'short'
  });
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      booking_id: data.id || data.booking?.id,
      time: bookedTime,
      response_to_customer: `Perfect! I've booked your AI Assessment for ${bookedTime}. You'll receive a confirmation email shortly. Is there anything else I can help you with?`
    })
  };
}
