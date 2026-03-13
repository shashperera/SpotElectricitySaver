# Spot Electricity Saver Finland Helsink

Do you want to save your household electrictiy during the peak time? If you wish to use a simple static website without installing anything this is the way. It’s designed for households who want to save on their energy bills by running appliances at the best times.
Here I have obtained data from spot-hinta.fi, Nord Pool and Fingrid.

## How it works
Fetches live hourly spot prices from spot-hinta.fi (no login needed).
Shows the best and worst hours to run appliances.
Calculates potential savings for common household devices.
Works both locally (with a Node.js proxy for CORS) and on GitHub Pages (no proxy needed)

No frameworks: Just modern JavaScript modules and Chart.js for graphs.
Easy to deploy: Just upload to GitHub Pages or any static host.
Local development: Use proxy.js to bypass CORS if you want live data on localhost.
