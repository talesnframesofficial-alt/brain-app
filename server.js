import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"));

// 🧠 ADVANCED MEMORY STRUCTURE
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type: String,       // people, finance, plans
  title: String,      // name or topic
  details: Object,    // structured data
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false }));

let chatHistory = [];

// 🧠 INTENT DETECTION (IMPORTANT)
function detectIntent(text){
  if(/remember|save|store|make note/i.test(text)) return "save";
  if(/who|what|show|tell/i.test(text)) return "retrieve";
  return "chat";
}

// 🧠 CATEGORY DETECTION
function detectType(text){
  if(/friend|father|mother|contact|name/i.test(text)) return "people";
  if(/money|salary|owe|debt/i.test(text)) return "finance";
  if(/plan|trip|travel/i.test(text)) return "plans";
  return "notes";
}

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    const intent = detectIntent(message);
    const type = detectType(message);

    // 🧠 SAVE LOGIC (SMART)
    if(intent === "save"){

      const aiExtract = await openai.chat.completions.create({
        model:"gpt-4o-mini",
        messages:[{
          role:"system",
          content:`
Extract structured info.

Return JSON:
{
 "title":"",
 "details":{}
}
`
        },
        {role:"user", content:message}]
      });

      let parsed;
      try {
        parsed = JSON.parse(aiExtract.choices[0].message.content);
      } catch {
        parsed = { title:"Note", details:{ text: message } };
      }

      await Memory.create({
        type,
        title: parsed.title,
        details: parsed.details,
        rawText: message
      });

      return res.json({
        reply:{
          title:"🧠 Saved Successfully",
          sections:[{
            heading:"Stored in memory",
            points:[`Saved under ${type}`],
            image_query:"database"
          }]
        }
      });
    }

    // 🧠 RETRIEVE LOGIC
    if(intent === "retrieve"){
      const data = await Memory.find().sort({createdAt:-1}).limit(10);

      if(data.length === 0){
        return res.json({
          reply:{
            title:"No Data Found",
            sections:[{
              heading:"Nothing stored yet",
              points:["Try saving something first"],
              image_query:"empty"
            }]
          }
        });
      }

      return res.json({
        reply:{
          title:"🧠 Your Stored Data",
          sections:data.map(d=>({
            heading:d.title || d.type,
            points:[d.rawText],
            image_query:d.type
          }))
        }
      });
    }

    // 🧠 NORMAL CHAT (LIKE ME)
    const response = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`
You are Wang AI.

Behave like ChatGPT:
- Understand intent
- Ask questions if unclear
- Give suggestions
- Be natural

Return JSON format only.
`
        },
        ...chatHistory.slice(-6),
        {role:"user", content:message}
      ]
    });

    let raw = response.choices[0].message.content;

    let reply;
    try {
      reply = JSON.parse(raw);
    } catch {
      reply = {
        title:"Response",
        sections:[{
          heading:"AI",
          points:[raw],
          image_query:"ai"
        }]
      };
    }

    chatHistory.push({ role:"user", content:message });

    res.json({ reply });

  } catch(err){
    res.json({
      reply:{
        title:"Error",
        sections:[{
          heading:"Something went wrong",
          points:[err.message],
          image_query:"error"
        }]
      }
    });
  }
});

app.get("/memory", async (req,res)=>{
  const data = await Memory.find().sort({createdAt:-1});
  res.json(data);
});

app.listen(3000, ()=>console.log("🚀 Wang Level 2 Running"));
