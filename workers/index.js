/**
 * Bottle Tracker API - Backend Worker endpoints
 */

// Worker handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Set CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    
    // Handle OPTIONS (preflight) request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    
    // Simple test endpoint for debugging
    if (path === "/test") {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Worker is functioning correctly",
        timestamp: new Date().toISOString() 
      }), {
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    // API endpoints
    if (path === "/data") {
      return await handleDataRequest(env, corsHeaders);
    }
    
    if (path === "/data/filemeta") {
      return await handleFileMetaRequest(env, corsHeaders);
    }
    
    // New insights endpoint
    if (path === "/insights") {
      return await handleInsightsRequest(env, corsHeaders);
    }
    
    // Default - 404
    return new Response(JSON.stringify({ error: "Not found", path }), { 
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
};

/**
 * Handle data request - fetch CSV from R2 and analyze results
 */
async function handleDataRequest(env, corsHeaders) {
  try {
    console.log("Data request received");
    
    if (!env || !env.R2_BUCKET) {
      console.error("R2_BUCKET binding is not available");
      return new Response(JSON.stringify({
        error: "R2 bucket binding not configured",
        details: "Please configure the R2_BUCKET binding in your Worker settings"
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    console.log("Fetching CSV from R2...");
    const csvObj = await env.R2_BUCKET.get("josie-feeding-data.csv");
    
    if (!csvObj) {
      console.error("CSV file not found in R2");
      return new Response(JSON.stringify({ 
        error: "CSV file not found in R2 storage",
        bucketName: env.R2_BUCKET.name 
      }), {
        status: 404,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    console.log("Reading CSV text...");
    const csvText = await csvObj.text();
    console.log("CSV size:", csvText.length, "bytes");
    
    console.log("Analyzing CSV data...");
    const analysisResults = analyzeBottleFeeds(csvText);
    console.log("Analysis complete");
    
    // Add timestamp to track when this data was generated
    analysisResults.timestamp = new Date().toISOString();
    
    // Calculate historical trends for each day
    analysisResults.trendHistory = calculateDailyTrends(analysisResults.allStats);
    console.log("Trend history calculated:", analysisResults.trendHistory.length, "days");
    
    // Add default baby weight if not already set
    if (!analysisResults.babyWeight) {
      analysisResults.babyWeight = 4.0; // Default weight in kg
    }
    
    // Add recommended intake based on weight (150ml/kg/day)
    analysisResults.recommendedIntake = analysisResults.babyWeight * 150;
    
    // Ensure we can serialize to JSON without errors
    try {
      const jsonString = JSON.stringify(analysisResults);
      console.log("JSON serialization successful, length:", jsonString.length);
      
      return new Response(jsonString, {
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    } catch (jsonError) {
      console.error("JSON serialization error:", jsonError);
      return new Response(JSON.stringify({
        error: "Failed to serialize analysis results",
        details: jsonError.message
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  } catch (error) {
    console.error("Data processing error:", error);
    
    return new Response(JSON.stringify({
      error: "Error processing data",
      details: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle file metadata request - get metadata for CSV file in R2
 */
async function handleFileMetaRequest(env, corsHeaders) {
  try {
    if (!env || !env.R2_BUCKET) {
      throw new Error("R2 bucket binding not configured");
    }
    
    // Get the object's metadata without downloading it
    const obj = await env.R2_BUCKET.head("josie-feeding-data.csv");
    
    if (!obj) {
      throw new Error("File not found");
    }
    
    // Return the metadata
    return new Response(JSON.stringify({
      fileName: "josie-feeding-data.csv",
      lastModified: obj.uploaded.toISOString(),
      size: obj.size
    }), {
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error getting file metadata:", error);
    
    return new Response(JSON.stringify({
      error: "Error getting file metadata",
      details: error.message
    }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle insights request - generate AI insights from feeding data
 */
async function handleInsightsRequest(env, corsHeaders) {
  try {
    // Check if Workers AI is available
    if (!env.AI) {
      return new Response(JSON.stringify({
        error: "Workers AI binding not configured",
        details: "Please add the AI binding in your Worker settings"
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    // Fetch the CSV data first
    console.log("Fetching CSV for insights...");
    const csvObj = await env.R2_BUCKET.get("josie-feeding-data.csv");
    
    if (!csvObj) {
      return new Response(JSON.stringify({ 
        error: "CSV file not found in R2 storage"
      }), {
        status: 404,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    const csvText = await csvObj.text();
    const analysisResults = analyzeBottleFeeds(csvText);
    
    // Process data for AI (create a simplified context)
    const aiContext = prepareAIContext(analysisResults);
    
    // Call Workers AI
    const insights = await generateInsights(aiContext, env);
    
    return new Response(JSON.stringify(insights), {
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error generating insights:", error);
    return new Response(JSON.stringify({
      error: "Failed to generate insights",
      details: error.message
    }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

/**
 * Prepare context for AI by extracting relevant information
 */
function prepareAIContext(data) {
  // Extract only what's needed for AI analysis
  const lastSevenDays = data.dailyStats;
  const recentTrend = data.recentTrend;
  const timeStats = data.timeStats;
  
  return {
    lastSevenDays,
    recentTrend,
    timeStats,
    babyWeight: data.babyWeight || 3.9,
    recommendedIntake: data.recommendedIntake || 585
  };
}

/**
 * Generate insights using Workers AI
 */
async function generateInsights(context, env) {
  try {
    // Define the prompt
    const prompt = `
      Based on this baby bottle feeding data for the past week:
      ${JSON.stringify(context.lastSevenDays)}
      
      Recent trend: ${JSON.stringify(context.recentTrend)}
      Time patterns: ${JSON.stringify(context.timeStats)}
      Baby's weight: ${context.babyWeight}kg
      Recommended daily intake: ${context.recommendedIntake}ml
      
      Please provide three short insights:
      1. A brief weekly summary (2-3 sentences)
      2. A comparison with the previous day (1-2 sentences)
      3. Any notable milestones or patterns (1-2 sentences)
      
      Format as JSON with keys: weekSummary, dayComparison, milestones
    `;
    
    // Call Workers AI
    const result = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt
    });
    
    // Parse the result (assuming it returns JSON)
    let insights;
    try {
      insights = JSON.parse(result.response.trim());
    } catch (e) {
      // If not valid JSON, create a structured object
      insights = {
        weekSummary: result.response,
        dayComparison: "",
        milestones: ""
      };
    }
    
    // Add timestamp
    insights.timestamp = new Date().toISOString();
    
    return insights;
  } catch (error) {
    console.error("Workers AI error:", error);
    return {
      weekSummary: "Unable to generate insights at this time.",
      dayComparison: "",
      milestones: "",
      error: error.message
    };
  }
}

/**
 * Parse a CSV line, handling quoted values properly
 */
function parseCSVLine(line) {
  if (!line || line.trim() === "") {
    return [];
  }
  
  const result = [];
  let startPos = 0;
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === "," && !inQuotes) {
      result.push(line.substring(startPos, i).replace(/^"|"$/g, "").trim());
      startPos = i + 1;
    }
  }
  
  result.push(line.substring(startPos).replace(/^"|"$/g, "").trim());
  return result;
}

/**
 * Analyze bottle feeds from CSV data
 */
function analyzeBottleFeeds(csvText) {
  try {
    var lines = csvText.split("\n");
    if (lines.length < 2) {
      throw new Error("CSV data appears to be empty or invalid");
    }
    
    var headers = lines[0].split(",").map(function(header) {
      return header.replace(/^"|"$/g, "").trim();
    });
    
    var typeIndex = headers.findIndex(function(h) {
      return h === "Type";
    });
    var startIndex = headers.findIndex(function(h) {
      return h === "Start";
    });
    var startLocationIndex = headers.findIndex(function(h) {
      return h === "Start Location";
    });
    var endConditionIndex = headers.findIndex(function(h) {
      return h === "End Condition";
    });
    
    if (typeIndex === -1 || startIndex === -1 || startLocationIndex === -1 || endConditionIndex === -1) {
      throw new Error("Required columns not found in CSV data");
    }
    
    var bottleFeeds = [];
    for (var i = 1; i < lines.length; i++) {
      if (!lines[i].trim())
        continue;
      
      var values = parseCSVLine(lines[i]);
      if (values.length <= Math.max(typeIndex, startIndex, startLocationIndex, endConditionIndex)) {
        continue;
      }
      
      if (values[startLocationIndex] && values[startLocationIndex].includes("Bottle")) {
        var dateTime = values[startIndex];
        var amount = 0;
        if (values[endConditionIndex]) {
          var match = values[endConditionIndex].match(/(\d+)/);
          if (match) {
            amount = parseInt(match[1], 10);
          }
        }
        
        if (dateTime && amount) {
          try {
            var dateParts = dateTime.split(" ");
            var date = dateParts[0];
            var time = dateParts[1] || "00:00";
            var hour = parseInt(time.split(":")[0], 10);
            
            bottleFeeds.push({
              date,
              time,
              hour,
              amount
            });
          } catch (err) {
            console.log("Skipping entry with invalid date/time: " + dateTime);
          }
        }
      }
    }
    
    if (bottleFeeds.length === 0) {
      throw new Error("No valid bottle feeds found in the CSV data");
    }
    
    bottleFeeds.sort(function(a, b) {
      return new Date(a.date + " " + a.time) - new Date(b.date + " " + b.time);
    });
    
    var feedsByDate = {};
    for (var j = 0; j < bottleFeeds.length; j++) {
      var feed = bottleFeeds[j];
      if (!feedsByDate[feed.date]) {
        feedsByDate[feed.date] = {
          feeds: [],
          totalAmount: 0,
          count: 0
        };
      }
      
      feedsByDate[feed.date].feeds.push(feed);
      feedsByDate[feed.date].totalAmount += feed.amount;
      feedsByDate[feed.date].count++;
    }
    
    var allStats = [];
    var dateKeys = Object.keys(feedsByDate);
    for (var k = 0; k < dateKeys.length; k++) {
      var date = dateKeys[k];
      var stats = feedsByDate[date];
      allStats.push({
        date,
        feedCount: stats.count,
        totalAmount: stats.totalAmount,
        averageAmount: Math.round(stats.totalAmount / stats.count * 10) / 10
      });
    }
    
    allStats.sort(function(a, b) {
      return new Date(a.date) - new Date(b.date);
    });
    
    var recentTrend = null;
    if (allStats.length >= 14) {
      var recentDays = allStats.slice(-7);
      var olderDays = allStats.slice(-14, -7);
      
      var recentSum = 0;
      for (var m = 0; m < recentDays.length; m++) {
        recentSum += recentDays[m].averageAmount;
      }
      var recentAvg = recentSum / recentDays.length;
      
      var olderSum = 0;
      for (var n = 0; n < olderDays.length; n++) {
        olderSum += olderDays[n].averageAmount;
      }
      var olderAvg = olderSum / olderDays.length;
      
      var percentChange = Math.round((recentAvg - olderAvg) / olderAvg * 1000) / 10;
      recentTrend = {
        recentAverage: Math.round(recentAvg * 10) / 10,
        olderAverage: Math.round(olderAvg * 10) / 10,
        percentChange
      };
    }
    
    var timeSlots = {
      "12am-6am": { count: 0, totalAmount: 0 },
      "6am-12pm": { count: 0, totalAmount: 0 },
      "12pm-6pm": { count: 0, totalAmount: 0 },
      "6pm-12am": { count: 0, totalAmount: 0 }
    };
    
    for (var p = 0; p < bottleFeeds.length; p++) {
      var feedItem = bottleFeeds[p];
      if (feedItem.hour >= 0 && feedItem.hour < 6) {
        timeSlots["12am-6am"].count++;
        timeSlots["12am-6am"].totalAmount += feedItem.amount;
      } else if (feedItem.hour >= 6 && feedItem.hour < 12) {
        timeSlots["6am-12pm"].count++;
        timeSlots["6am-12pm"].totalAmount += feedItem.amount;
      } else if (feedItem.hour >= 12 && feedItem.hour < 18) {
        timeSlots["12pm-6pm"].count++;
        timeSlots["12pm-6pm"].totalAmount += feedItem.amount;
      } else {
        timeSlots["6pm-12am"].count++;
        timeSlots["6pm-12am"].totalAmount += feedItem.amount;
      }
    }
    
    var timeStats = [];
    var slotKeys = Object.keys(timeSlots);
    for (var q = 0; q < slotKeys.length; q++) {
      var slot = slotKeys[q];
      var slotStats = timeSlots[slot];
      var percentage = Math.round(slotStats.count / bottleFeeds.length * 1000) / 10;
      timeStats.push({
        hour: slot,
        count: slotStats.count,
        totalAmount: slotStats.totalAmount,
        percentage,
        averageAmount: slotStats.count > 0 ? Math.round(slotStats.totalAmount / slotStats.count * 10) / 10 : 0
      });
    }
    
    var totalAmount = 0;
    for (var r = 0; r < bottleFeeds.length; r++) {
      totalAmount += bottleFeeds[r].amount;
    }
    
    return {
      overallStats: {
        totalBottleFeeds: bottleFeeds.length,
        dateRange: {
          start: bottleFeeds.length > 0 ? bottleFeeds[0].date : "N/A",
          end: bottleFeeds.length > 0 ? bottleFeeds[bottleFeeds.length - 1].date : "N/A"
        },
        averageDailyFeeds: Math.round(bottleFeeds.length / Object.keys(feedsByDate).length * 10) / 10,
        averageFeedSize: Math.round(totalAmount / bottleFeeds.length * 10) / 10
      },
      recentTrend,
      dailyStats: allStats.slice(-7), // Last 7 days
      allStats, // All data for historical charts
      timeStats,
      rawFeeds: bottleFeeds // Include raw feeds data for detailed view
    };
  } catch (error) {
    console.error("Error analyzing bottle feeds:", error);
    throw new Error("Failed to analyze CSV: " + error.message);
  }
}

/**
 * Calculate trend for each day based on historical data
 */
function calculateDailyTrends(allStats) {
  if (!allStats || allStats.length < 14) {
    console.log("Not enough data to calculate trend history");
    return [];
  }
  
  // Sort data by date
  var sortedStats = allStats.slice().sort(function(a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  
  var trendHistory = [];
  
  // For each day (starting from day 14), calculate the trend
  for (var i = 13; i < sortedStats.length; i++) {
    // Get last 7 days including current day
    var recentDays = sortedStats.slice(i - 6, i + 1);
    // Get 7 days before that
    var olderDays = sortedStats.slice(Math.max(0, i - 13), i - 6);
    
    if (recentDays.length > 0 && olderDays.length > 0) {
      // Calculate averages
      var recentSum = 0;
      for (var j = 0; j < recentDays.length; j++) {
        recentSum += recentDays[j].averageAmount;
      }
      var recentAvg = recentSum / recentDays.length;
      
      var olderSum = 0;
      for (var k = 0; k < olderDays.length; k++) {
        olderSum += olderDays[k].averageAmount;
      }
      var olderAvg = olderSum / olderDays.length;
      
      // Calculate percent change
      var percentChange = Math.round((recentAvg - olderAvg) / olderAvg * 1000) / 10;
      
      trendHistory.push({
        date: sortedStats[i].date,
        value: percentChange,
        // Include the raw values used to calculate the trend
        recentAvg: Math.round(recentAvg * 10) / 10,
        olderAvg: Math.round(olderAvg * 10) / 10
      });
    }
  }
  
  return trendHistory;
}