```javascript
/**
 * CSV Upload Worker for Baby Bottle Tracker
 * This worker handles CSV file uploads to R2 storage
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return handleCORS(request);
    }
    
    // Route handling
    const url = new URL(request.url);
    
    // Handle CSV upload endpoint
    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }
    
    // Default response for unhandled routes
    return new Response("Not found", { status: 404 });
  }
};

/**
 * Handle CORS preflight requests
 */
function handleCORS(request) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    }
  });
}

/**
 * Handle file upload to R2
 */
async function handleUpload(request, env) {
  try {
    // Check for correct content type
    const contentType = request.headers.get("Content-Type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return errorResponse(400, "Invalid content type, must be multipart/form-data");
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get("file");
    
    if (!file || !(file instanceof File)) {
      return errorResponse(400, "No file provided");
    }
    
    // Validate it's a CSV file
    if (!file.name.endsWith(".csv")) {
      return errorResponse(400, "File must be a CSV");
    }
    
    // Read file content
    const fileContent = await file.text();
    
    // Validate CSV structure (basic check)
    if (!validateCSV(fileContent)) {
      return errorResponse(400, "Invalid CSV format");
    }
    
    // Upload to R2
    await env.R2_BUCKET.put("feeding-data.csv", fileContent, {
      httpMetadata: {
        contentType: "text/csv",
      }
    });
    
    return jsonResponse({
      success: true,
      message: "File uploaded successfully",
      filename: file.name,
      size: file.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return errorResponse(500, `Error processing upload: ${error.message}`);
  }
}

/**
 * Basic CSV validation
 */
function validateCSV(content) {
  // Check for common headers in the feeding data
  const lines = content.split("\n");
  if (lines.length < 2) return false;
  
  const headers = lines[0].toLowerCase();
  return headers.includes("type") && 
         headers.includes("start") && 
         headers.includes("location") && 
         headers.includes("condition");
}

/**
 * Helper for error responses
 */
function errorResponse(status, message) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

/**
 * Helper for JSON responses
 */
function jsonResponse(data) {
  return new Response(
    JSON.stringify(data),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
```