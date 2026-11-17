# SuperBar privacy

SuperBar runs on your BUSY Bar. It has no developer-operated server, accounts, analytics, advertising, or telemetry.

## Weather

When weather is enabled, the Bar sends the latitude and longitude configured in the app to `https://api.open-meteo.com/v1/forecast`. Open-Meteo also receives the connection's IP address. The app uses the response for temperature, sunset time, and rain or storm alerts. Successful requests refresh every ten minutes; failures retry with backoff.

The coordinates come from the location you configure. SuperBar does not automatically track your physical location. Disable Weather to stop weather requests. Open-Meteo handles requests under its [privacy policy](https://open-meteo.com/en/terms#privacy).

## Settings and other features

App settings are stored by BUSY Bar firmware. Weather responses are held in app memory. Timer and reminder-dismissal state are saved locally when the firmware provides localStorage; otherwise they last for the app session.

The clock and world-clock zone list come from the Bar's local API. SuperBar does not read calendar events, request Google access, or send reminders or timer data to the developer. BUSY's existing calendar integration operates separately.

The optional local setup page runs on your computer and communicates directly with your Bar and Open-Meteo. It does not route data through a developer server.

For questions, open an issue in the source repository.
