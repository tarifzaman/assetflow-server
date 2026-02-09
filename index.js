const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.da9dhi6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("assetFlowDB");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const requestsCollection = db.collection("requests");

    // --- Users API ---
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) return res.send({ message: "exists", insertedId: null });
      res.send(await usersCollection.insertOne(user));
    });

    app.get("/users/role/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send(user || { role: null });
    });

    // --- Assets API ---
    app.post("/assets", async (req, res) => res.send(await assetsCollection.insertOne(req.body)));
    app.get("/assets", async (req, res) => {
      const query = req.query.email ? { hrEmail: req.query.email } : {};
      res.send(await assetsCollection.find(query).toArray());
    });

    // --- Requests API ---
    app.post("/requests", async (req, res) => res.send(await requestsCollection.insertOne(req.body)));
    
    app.get("/hr-requests/:email", async (req, res) => {
      res.send(await requestsCollection.find({ hrEmail: req.params.email }).toArray());
    });

    app.get("/my-requests/:email", async (req, res) => {
      res.send(await requestsCollection.find({ requesterEmail: req.params.email }).toArray());
    });

    // APPROVE
    app.patch("/requests/approve/:id", async (req, res) => {
      const { assetId, requesterEmail, hrEmail } = req.body;
      await requestsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "approved", approvalDate: new Date() } });
      await assetsCollection.updateOne({ _id: new ObjectId(assetId) }, { $inc: { productQuantity: -1 } });
      res.send(await usersCollection.updateOne({ email: requesterEmail }, { $set: { hrEmail: hrEmail } }));
    });

    // REJECT
    app.patch("/requests/reject/:id", async (req, res) => {
      res.send(await requestsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "rejected" } }));
    });

    // RETURN
    app.patch("/requests/return/:id", async (req, res) => {
      const { assetId } = req.body;
      await requestsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "returned" } });
      res.send(await assetsCollection.updateOne({ _id: new ObjectId(assetId) }, { $inc: { productQuantity: 1 } }));
    });

  } finally {}
}
run().catch(console.dir);
app.get("/", (req, res) => res.send("Running"));
app.listen(port);