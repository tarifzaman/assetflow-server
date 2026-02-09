const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.da9dhi6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect to DB
    await client.connect();
    console.log("✅ Successfully connected to MongoDB Cluster!");

    const db = client.db("assetFlowDB");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const requestsCollection = db.collection("requests");

    // ================== USERS API ==================
    // নতুন ইউজার রেজিস্টার করা
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser)
        return res.send({ message: "user already exists", insertedId: null });
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // ইউজারের রোল চেক করা
    app.get("/users/role/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send(user || { role: null });
    });

    // ================== ASSETS API ==================
    // নতুন অ্যাসেট অ্যাড করা (HR)
    app.post("/assets", async (req, res) => {
      const asset = req.body;
      const result = await assetsCollection.insertOne(asset);
      res.send(result);
    });

    // সব অ্যাসেট দেখা (ইমেইল ফিল্টারিং সহ)
    app.get("/assets", async (req, res) => {
      const email = req.query.email;
      const query = email ? { hrEmail: email } : {};
      const result = await assetsCollection.find(query).toArray();
      res.send(result);
    });

    // অ্যাসেট ডিলিট করা
    app.delete("/assets/:id", async (req, res) => {
      const result = await assetsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // ================== REQUESTS API ==================

    // ১. এমপ্লয়ির রিকোয়েস্ট তৈরি করা
    app.post("/requests", async (req, res) => {
      const request = req.body;
      const result = await requestsCollection.insertOne(request);
      res.send(result);
    });

    // ২. HR-এর জন্য সব পেন্ডিং রিকোয়েস্ট দেখা
    app.get("/hr-requests/:email", async (req, res) => {
      const email = req.params.email;
      const result = await requestsCollection.find({ hrEmail: email }).toArray();
      res.send(result);
    });

    // ৩. এমপ্লয়ির নিজের রিকোয়েস্ট লিস্ট দেখা
    app.get("/my-requests/:email", async (req, res) => {
      const email = req.params.email;
      const result = await requestsCollection
        .find({ requesterEmail: email })
        .toArray();
      res.send(result);
    });

    // ৪. রিকোয়েস্ট ক্যানসেল বা ডিলিট করা
    app.delete("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await requestsCollection.deleteOne(query);
      res.send(result);
    });

    // ৫. রিকোয়েস্ট Approve করা (অ্যাসেট কমানো এবং এমপ্লয়িকে লিস্টে অ্যাড করা)
    app.patch("/requests/approve/:id", async (req, res) => {
      const id = req.params.id;
      const { assetId, requesterEmail, hrEmail } = req.body;

      // ক. রিকোয়েস্ট স্ট্যাটাস 'approved' করা
      await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { status: "approved", approvalDate: new Date().toISOString() },
        }
      );

      // খ. অ্যাসেট কোয়ান্টিটি ১ কমানো
      await assetsCollection.updateOne(
        { _id: new ObjectId(assetId) },
        { $inc: { productQuantity: -1 } }
      );

      // গ. এমপ্লয়ির প্রোফাইলে HR-এর লিঙ্ক সেভ করা (যাতে My Employee লিস্টে নাম আসে)
      const result = await usersCollection.updateOne(
        { email: requesterEmail },
        { $set: { hrEmail: hrEmail } }
      );

      res.send(result);
    });

    // ৬. রিকোয়েস্ট Reject করা
    app.patch("/requests/reject/:id", async (req, res) => {
      const id = req.params.id;
      const result = await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected" } },
      );
      res.send(result);
    });

    // ================== MY EMPLOYEES API ==================
    // নির্দিষ্ট HR-এর আন্ডারে থাকা সব এমপ্লয়ি দেখা
    app.get("/my-employees/:hrEmail", async (req, res) => {
      const email = req.params.hrEmail;
      const result = await usersCollection
        .find({ hrEmail: email, role: "employee" })
        .toArray();
      res.send(result);
    });

  } catch (err) {
    console.error("❌ DB error:", err.message);
  }
}
run().catch(console.dir);

// Root API
app.get("/", (req, res) => res.send("AssetFlow Server is running"));

// Server Listen
app.listen(port, () => console.log(`🚀 Server listening on port ${port}`));