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
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser)
        return res.send({ message: "user already exists", insertedId: null });
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/role/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send(user || { role: null });
    });

    // ================== ASSETS API ==================
    app.post("/assets", async (req, res) => {
      const asset = req.body;
      const newAsset = {
        ...asset,
        productQuantity: parseInt(asset.productQuantity),
        addedDate: asset.addedDate || new Date().toISOString()
      };
      const result = await assetsCollection.insertOne(newAsset);
      res.send(result);
    });

    app.get("/assets", async (req, res) => {
      const email = req.query.email;
      const query = email ? { hrEmail: email } : {};
      const result = await assetsCollection.find(query).toArray();
      res.send(result);
    });

    // কোয়ান্টিটি আপডেট করার ফিক্সড এপিআই
    app.patch("/assets/update/:id", async (req, res) => {
      const id = req.params.id;
      const { productQuantity } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          productQuantity: parseInt(productQuantity), // সংখ্যা নিশ্চিত করা
        },
      };
      const result = await assetsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/assets/:id", async (req, res) => {
      const result = await assetsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // ================== REQUESTS API ==================
    app.post("/requests", async (req, res) => {
      const request = req.body;
      const result = await requestsCollection.insertOne(request);
      res.send(result);
    });

    app.get("/hr-requests/:email", async (req, res) => {
      const email = req.params.email;
      const result = await requestsCollection.find({ hrEmail: email }).toArray();
      res.send(result);
    });

    app.get("/my-requests/:email", async (req, res) => {
      const email = req.params.email;
      const query = { requesterEmail: email };
      const result = await requestsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await requestsCollection.deleteOne(query);
      res.send(result);
    });

    // ৫. রিকোয়েস্ট Approve করা
    app.patch("/requests/approve/:id", async (req, res) => {
      const id = req.params.id;
      const { assetId, requesterEmail, hrEmail } = req.body;
      const hr = await usersCollection.findOne({ email: hrEmail });
      const count = await usersCollection.countDocuments({ hrEmail: hrEmail, role: "employee" });
      const limit = hr?.packageLimit || 5;

      if (count >= limit) {
        return res.status(400).send({ message: "Limit reached" });
      }

      await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved", approvalDate: new Date().toISOString() } }
      );
      await assetsCollection.updateOne(
        { _id: new ObjectId(assetId) },
        { $inc: { productQuantity: -1 } }
      );
      const result = await usersCollection.updateOne(
        { email: requesterEmail },
        { $set: { hrEmail: hrEmail } }
      );
      res.send(result);
    });

    app.patch("/requests/reject/:id", async (req, res) => {
      const id = req.params.id;
      const result = await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected" } },
      );
      res.send(result);
    });

    app.patch("/requests/return/:id", async (req, res) => {
      const id = req.params.id;
      const { assetId } = req.body;
      await requestsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "returned" } });
      const result = await assetsCollection.updateOne(
        { _id: new ObjectId(assetId) },
        { $inc: { productQuantity: 1 } }
      );
      res.send(result);
    });

    app.get("/my-employees/:hrEmail", async (req, res) => {
      const result = await usersCollection.find({ hrEmail: req.params.hrEmail, role: "employee" }).toArray();
      res.send(result);
    });

    app.delete("/remove-employee/:email", async (req, res) => {
      const { email } = req.params;
      const result = await usersCollection.updateOne({ email: email }, { $unset: { hrEmail: "" } });
      res.send(result);
    });

  } catch (err) {
    console.error("❌ DB error:", err.message);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("AssetFlow Server is running"));
app.listen(port, () => console.log(`🚀 Server listening on port ${port}`));