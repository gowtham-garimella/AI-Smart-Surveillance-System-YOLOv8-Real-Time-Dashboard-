import { GoogleGenerativeAI } from '@google/generative-ai';

const getGenAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GoogleGenerativeAI(apiKey);
};

export interface AIExplanationInput {
  videoName: string;
  objectCounts: Record<string, number>;
  alerts: string[];
  recentLogs: Array<{ time: string; label: string; confidence: number }>;
}

export function localFallbackExplanation(input: AIExplanationInput): string {
  const { videoName, objectCounts, alerts, recentLogs } = input;
  
  const isImage = videoName.toLowerCase().endsWith('.png') || 
                  videoName.toLowerCase().endsWith('.jpg') || 
                  videoName.toLowerCase().endsWith('.jpeg') || 
                  videoName.toLowerCase().endsWith('.webp') ||
                  videoName.toLowerCase().endsWith('.bmp');
                  
  const fileTypeStr = isImage ? "static capture scan" : "continuous video feed stream";
  
  let explanation = `### 📈 Security Operations Summary\n\n`;
  explanation += `A local analytical scan of the ${fileTypeStr} **${videoName}** has completed. `;
  
  // Dynamic description generation
  const labels = Object.keys(objectCounts);
  if (labels.length > 0) {
    explanation += `The YOLOv8 vision pipeline successfully identified **${labels.length}** distinct object categories. `;
    
    const descriptions: string[] = [];
    if (objectCounts.person) descriptions.push(`**pedestrian/human activity** (detected ${objectCounts.person} times)`);
    
    const vehicleCount = (objectCounts.car || 0) + (objectCounts.truck || 0) + (objectCounts.motorcycle || 0) + (objectCounts.bus || 0);
    if (vehicleCount > 0) descriptions.push(`**vehicular traffic** (${vehicleCount} transport unit indicators identified)`);
    
    const animalCount = (objectCounts.dog || 0) + (objectCounts.cat || 0) + (objectCounts.bird || 0) + (objectCounts.bear || 0) + (objectCounts.sheep || 0) + (objectCounts.cow || 0) + (objectCounts.elephant || 0);
    if (animalCount > 0) descriptions.push(`**animal tracking** (${animalCount} logs)`);
    
    const luggageCount = (objectCounts.backpack || 0) + (objectCounts.suitcase || 0) + (objectCounts.handbag || 0);
    if (luggageCount > 0) descriptions.push(`**luggage or bags** (${luggageCount} accessory tags logged)`);
    
    const electronicsCount = (objectCounts.laptop || 0) + (objectCounts.tv || 0) + (objectCounts.cell_phone || 0) + (objectCounts.keyboard || 0) + (objectCounts.book || 0);
    if (electronicsCount > 0) descriptions.push(`**office or personal items** (${electronicsCount} logs)`);

    if (descriptions.length > 0) {
      explanation += `The stream sequence displays observations of ${descriptions.join(', ')}. `;
    } else {
      explanation += `Observations include common classifications like: ${labels.slice(0, 3).join(', ')}. `;
    }
  } else {
    explanation += `No active moving targets or objects were detected above the threshold filter in this capture frame. `;
  }
  explanation += `\n\n`;

  // Object breakdown
  if (labels.length > 0) {
    explanation += `#### 📊 Object Breakdown\n`;
    labels.forEach(label => {
      const count = objectCounts[label];
      explanation += `- **${label.toUpperCase()}**: Registered **${count}** instance tag(s).\n`;
    });
    explanation += `\n`;
  }

  // Dynamic security alerts log assessment
  explanation += `### 🚨 Critical Incident Log\n`;
  if (alerts.length > 0) {
    explanation += `**Security Warning Level: Active**. The OMNI-SEC threat detection rule triggered **${alerts.length}** event warnings requiring inspection:\n\n`;
    alerts.forEach(alert => {
      explanation += `- ${alert}\n`;
    });
    
    explanation += `\n**Incident Assessment**: Chronological matching indicates `;
    
    // Extract alerting classes dynamically
    const alertLabels = new Set<string>();
    alerts.forEach(a => {
      const match = a.match(/ALERT: (?:Unauthorized )?([A-Z]+)/i);
      if (match) alertLabels.add(match[1].toLowerCase());
    });
    
    const assessments: string[] = [];
    if (alertLabels.has('person')) {
      assessments.push("unauthorized pedestrian presence in the designated perimeter");
    }
    if (alertLabels.has('car') || alertLabels.has('truck') || alertLabels.has('motorcycle')) {
      assessments.push("vehicle passage or entry checkpoints crossing");
    }
    if (alertLabels.has('dog') || alertLabels.has('cat') || alertLabels.has('bear')) {
      assessments.push("animal boundary entry in sector zone");
    }
    
    if (assessments.length > 0) {
      explanation += `${assessments.join(' and ')}. `;
    } else {
      explanation += `activity matching the configured warning parameters. `;
    }
    explanation += `Security operators should inspect the raw camera frames at the logged timestamps to verify entry logs and check credentials. `;
  } else {
    explanation += `**Security Status: Clear**. No warning targets violated monitoring boundaries. All recognized objects remained within standard baseline behavior. No operator action is required. `;
  }
  explanation += `\n\n`;

  // Dynamic recommendations advisory
  explanation += `### 🛡️ SOC Advisory & Recommendations\n`;
  if (alerts.length > 0) {
    explanation += `- **Log Audit**: Audit the **Terminal Event Stream** and seek the video to the logged alert times to review the security context.\n`;
    explanation += `- **Permit Checking**: If vehicles are detected, match license numbers or permits against standard daily authorization lists.\n`;
    explanation += `- **Motion Masking**: Adjust active sensor thresholds if animals continue to trigger false sector alarms.\n`;
  } else {
    explanation += `- **Routine Logs**: Continue active camera capture streams to build the normal baseline telemetry database.\n`;
    explanation += `- **Static Settings**: No changes to active sensor thresholds are recommended at this time.\n`;
  }

  return explanation;
}

export async function explainSurveillanceVideo(input: AIExplanationInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    console.warn("GEMINI_API_KEY is missing or placeholder. Running local rule-based surveillance log analysis.");
    return localFallbackExplanation(input);
  }

  try {
    const genAI = getGenAIClient();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an advanced Security Operations Center (SOC) AI Analyst. Your task is to analyze surveillance camera logs and compile a comprehensive security report detailing what occurred in the video.

Video Filename: ${input.videoName}
Total Alert Occurrences: ${input.alerts.length}
Chronological Alert Log:
${JSON.stringify(input.alerts, null, 2)}

Aggregated Object Detection Totals:
${JSON.stringify(input.objectCounts, null, 2)}

Detailed Chronological Timeline:
${JSON.stringify(input.recentLogs.slice(0, 30), null, 2)}

Instructions:
1. Write a professional, human-readable security explanation explaining what happens in this video.
2. Group the report into structured Markdown sections:
   - ### 📈 Security Operations Summary (A high-level explanation of the video activity)
   - ### 🚨 Critical Incident Log (Review of any security alerts triggered)
   - ### 🛡️ SOC Advisory & Recommendations (Provide action steps if needed)
3. Keep the tone clinical, professional, and clear. Avoid generic boilerplate. Explain how the objects (e.g. cars, persons) relate to each other chronologically (e.g. "A car arrived followed by a person walking near the driveway").

Return the explanation in Markdown.
`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error calling Gemini API for video explanation:", error);
    return localFallbackExplanation(input);
  }
}
