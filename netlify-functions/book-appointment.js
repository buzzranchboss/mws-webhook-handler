/**
 * MWS Webhook - Handles Cal.com booking via Retell agent
 * Supports: check_availability, book_appointment, update_booking_email, cancel_booking
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

    switch (toolName) {
      case 'check_availability':
        return await checkAvailability(parameters);
      case 'book_appointment':
        return await bookAppointment(parameters);
      case 'update_booking_email':
        return await updateBookingEmail(parameters);
      case 'cancel_booking':
        return await cancelBooking(parameters);
      default:
        return {
          statusCode: 200,
          body: JSON.stringify({ error: 'Unknown tool', tool_name: toolName })
        };
    }
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
  // Guide the caller to pick a time
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

  const { name, email, phone, datetime, confirmed } = params;

  // If not confirmed, ask for verification first
  if (!confirmed) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        needs_confirmation: true,
        response_to_customer: `Let me confirm your details before booking: Your name is ${name}, and your email address is ${email}. Is that correct? Please say yes to confirm or correct me if anything is wrong.`
      })
    };
  }

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
      booking_uid: data.uid || data.booking?.uid,
      response_to_customer: `Perfect! I've booked your AI Assessment for ${bookedTime}. You'll receive a confirmation email shortly at ${email}. Is there anything else I can help you with?`
    })
  };
}

async function updateBookingEmail(params) {
  const CAL_API_KEY = process.env.CAL_API_KEY;
  const { booking_uid, new_email } = params;

  if (!booking_uid || !new_email) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        response_to_customer: "I need the booking reference and new email address to update. Could you provide those?"
      })
    };
  }

  // Cal.com doesn't support direct email updates
  // We need to get the booking details, cancel it, and rebook
  const getResponse = await fetch(`https://api.cal.com/v2/bookings/${booking_uid}`, {
    headers: {
      'Authorization': `Bearer ${CAL_API_KEY}`,
      'cal-api-version': '2024-06-14'
    }
  });

  const bookingData = await getResponse.json();

  if (!getResponse.ok) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        response_to_customer: "I couldn't find that booking. Could you provide the email address you used originally?"
      })
    };
  }

  const booking = bookingData.data;
  const startTime = booking.startTime;
  const responses = booking.responses || {};
  const EVENT_TYPE_ID = booking.eventTypeId || process.env.EVENT_TYPE_ID || '5428433';

  // Cancel the old booking
  await fetch(`https://api.cal.com/v2/bookings/${booking_uid}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CAL_API_KEY}`,
      'cal-api-version': '2024-06-14',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      cancellationReason: 'Email correction - updating contact information'
    })
  });

  // Rebook with new email
  const newBooking = await fetch('https://api.cal.com/v2/bookings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CAL_API_KEY}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-06-14'
    },
    body: JSON.stringify({
      eventTypeId: EVENT_TYPE_ID,
      start: startTime,
      timeZone: 'America/Chicago',
      language: 'en',
      responses: {
        name: responses.name || 'Unknown',
        email: new_email,
        phone: responses.phone || ''
      },
      metadata: {
        source: 'AI Receptionist - email correction'
      }
    })
  });

  const newData = await newBooking.json();

  if (!newBooking.ok) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        response_to_customer: "I had trouble updating your email. The time slot may have been taken. Would you like to try a different time?"
      })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      response_to_customer: `I've updated your email to ${new_email}. You'll receive a confirmation at that address shortly.`
    })
  };
}

async function cancelBooking(params) {
  const CAL_API_KEY = process.env.CAL_API_KEY;
  const { booking_uid, reason } = params;

  if (!booking_uid) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        response_to_customer: "I need the booking reference to cancel. Could you provide the email you used to book?"
      })
    };
  }

  const response = await fetch(`https://api.cal.com/v2/bookings/${booking_uid}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CAL_API_KEY}`,
      'cal-api-version': '2024-06-14',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      cancellationReason: reason || 'Cancelled by caller'
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        response_to_customer: "I couldn't cancel that booking. Would you like me to take a message for Dave to handle this manually?"
      })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      response_to_customer: "I've cancelled your appointment. Is there anything else I can help you with?"
    })
  };
}
