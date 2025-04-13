# Baby Bottle Feeding Tracker

A responsive web dashboard for tracking and visualizing baby bottle feeding data from Huckleberry's CSV exports.

## Features

- 📊 Data visualization with interactive charts
- 📱 Mobile-responsive design
- 📅 Filter by date range
- 📈 Trend analysis and statistics
- ⏱️ Time of day distribution
- 🔄 Feeding interval analysis
- 🏋️ Weight-based recommended intake calculation
- 📤 CSV file upload capability

## Technical Architecture

This application has three main components:

1. **Frontend**: Static HTML/CSS/JavaScript (in the `/pages` directory)
2. **Data API**: Cloudflare Workers API (in the `/workers` directory)
3. **Upload API**: Separate Cloudflare Worker for CSV uploads (code in `csv_upload_worker_code.md`)

The backend reads a CSV file from Cloudflare R2 storage, processes the data, and returns analysis results to the frontend. The upload worker handles secure CSV file uploads to the R2 bucket.

## Setup Instructions

### Backend Setup

1. Create a Cloudflare account (if you don't have one)
2. Install Wrangler CLI:
   ```
   npm install -g wrangler
   ```
3. Login to your Cloudflare account:
   ```
   wrangler login
   ```
4. Create an R2 bucket in your Cloudflare account named `feeding-data`
5. Update the `workers/wrangler.toml` file with your account details (optional)
6. Deploy the data API worker:
   ```
   cd workers
   wrangler deploy
   ```
7. Deploy the upload worker:
   ```
   # Create a new directory for the upload worker
   mkdir upload-worker
   cd upload-worker
   
   # Create index.js with the code from csv_upload_worker_code.md
   # Create wrangler.toml with the following content:
   # name = "bottle-tracker-upload"
   # main = "index.js"
   # compatibility_date = "2023-09-01"
   # [[r2_buckets]]
   # binding = "R2_BUCKET"
   # bucket_name = "feeding-data"
   
   wrangler deploy
   ```
8. Note your Worker URLs (usually `bottle-tracker.yourdomain.workers.dev` and `bottle-tracker-upload.yourdomain.workers.dev`)

### Frontend Setup

1. Update the API endpoints in `pages/js/dashboard.js`:
   ```javascript
   // Configuration - Update this to your worker domain
   const API_ENDPOINT = 'bottle-tracker.yourdomain.workers.dev';
   ```

2. Create an upload form page that points to your upload worker:
   ```html
   <form action="https://bottle-tracker-upload.yourdomain.workers.dev/upload" 
         method="post" 
         enctype="multipart/form-data">
     <input type="file" name="file" accept=".csv">
     <button type="submit">Upload CSV</button>
   </form>
   ```

3. Host the `pages` directory on any static web hosting service:
   - GitHub Pages
   - Cloudflare Pages
   - Netlify
   - Vercel
   - Or simply run it locally with a local web server

## CSV Data Format

The application expects a CSV file in your R2 bucket with the following columns:
- Type
- Start
- Start Location
- End Condition

Example format:
```
Type,Start,Start Location,End Condition
Feed,2023-03-01 08:00,Bottle,120ml
Feed,2023-03-01 12:30,Bottle,150ml
```

## Customization

- Update the default baby weight in `workers/index.js`
- Modify charts and UI elements in the frontend code
- Add additional analysis in the Workers backend