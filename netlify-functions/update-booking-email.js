/**
 * Update booking email - called from Retell when caller corrects their email
 */

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const CAL_API_KEY = process.env.CAL_API_KEY;
    let { booking_uid, old_email, new_email } = body;

    console.log('Update booking email:', { booking_uid, old_email, new_email });

    // If no booking_uid provided, look up by old_email
    if (!booking_uid && old_email) {
      const listResponse = await fetch(`https://api.cal.com/v2/bookings?limit=10`, {
        headers: {
          'Authorization': `Bearer ${CAL_API_KEY}`,
          'cal-api-version': '2024-06-14'
        }
      });
      const listData = await listResponse.json();
      const bookings = listData.data?.bookings || [];
      
      // Find booking by email
      const match = bookings.find(b => {
        const attendeeEmail = b.attendees?.[0]?.email?.toLowerCase();
        const responseEmail = b.responses?.email?.toLowerCase();
        return attendeeEmail === old_email.toLowerCase() || responseEmail === old_email.toLowerCase();
      });
      
      if (match) {
        booking_uid = match.uid;
        console.log('Found booking by email:', booking_uid);
      }
    }

    if (!booking_uid || !new_email) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          response_to_customer: "I need either your booking reference ID or the email address you originally used, plus the new email address. What email did you use when booking?"
        })
      };
    }

    // Get the booking details
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

  } catch (error) {
    console.error('Update booking error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
