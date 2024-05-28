const express = require("express");
const faceapi = require("face-api.js");
const mongoose = require("mongoose");
const { Canvas, Image } = require("canvas");
const canvas = require("canvas");
const fileUpload = require("express-fileupload");
faceapi.env.monkeyPatch({ Canvas, Image });
const cors = require("cors")
const bodyParser = require("body-parser");


const app = express();
app.use(cors())
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({limit: '50mb',extended : true}));
app.use(
  cors({
    origin: 'http://localhost:5173', // Allow requests from this origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allow these HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allow these headers
  })
);


app.use(fileUpload({ useTempFiles: true }));

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/VotingSystem', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
    app.listen(process.env.PORT || 5000);
    console.log("DB connected and server is running.");
  })
  

// Load face detection models
async function loadModels() {
  await faceapi.nets.faceRecognitionNet.loadFromDisk(__dirname + "/models");
  await faceapi.nets.faceLandmark68Net.loadFromDisk(__dirname + "/models");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(__dirname + "/models");
}
loadModels();

// Define MongoDB schema and model
const faceSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    unique: true,
  },
  descriptions: {
    type: Array,
    required: true,
  },
});

const FaceModel = mongoose.model("Face", faceSchema);

// Upload labeled images
async function uploadLabeledImages(images, label) {
  try {
    const descriptions = [];
    for (let i = 0; i < images.length; i++) {
      const img = await canvas.loadImage(images[i]);
      const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
      descriptions.push(detections.descriptor);
    }

    const createFace = new FaceModel({
      label: label,
      descriptions: descriptions,
    });
    await createFace.save();
    return true;
  } catch (error) {
    console.log(error);
    return error;
  }
}

// Handle POST request to upload faces
app.post("/post-face", async (req, res) => {
  const File1 = req.files.File1.tempFilePath;
  const File2 = req.files.File2.tempFilePath;
  const File3 = req.files.File3.tempFilePath;
  const label = req.body.label;
  
  let result = await uploadLabeledImages([File1, File2, File3], label);
  
  if (result) {
    res.json({ message: "Face data stored successfully" });
  } else {
    res.json({ message: "Something went wrong, please try again." });
  }
});

// Retrieve face descriptors from database
async function getDescriptorsFromDB(image) {
  let faces = await FaceModel.find();
  
  for (i = 0; i < faces.length; i++) {
    for (j = 0; j < faces[i].descriptions.length; j++) {
      faces[i].descriptions[j] = new Float32Array(Object.values(faces[i].descriptions[j]));
    }
    faces[i] = new faceapi.LabeledFaceDescriptors(faces[i].label, faces[i].descriptions);
  }

  const faceMatcher = new faceapi.FaceMatcher(faces, 0.6);
  const img = await canvas.loadImage(image);
  let temp = faceapi.createCanvasFromMedia(img);
  const displaySize = { width: img.width, height: img.height };
  faceapi.matchDimensions(temp, displaySize);

  const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
  const resizedDetections = faceapi.resizeResults(detections, displaySize);
  const results = resizedDetections.map((d) => faceMatcher.findBestMatch(d.descriptor));
  return results;
}

// Handle POST request to check faces
app.post("/check-face", async (req, res) => {
  const File1 = req.files.File1.tempFilePath;
  let result = await getDescriptorsFromDB(File1);
  res.json({ result });

});


// Define MongoDB schema for party enrollment
const partySchema = new mongoose.Schema({
  partyName: {
    type: String,
    required: true,
  },
  partyLeader: {
    type: String,
    required: true,
  },
  partySymbol: {
    type: String,
    required: true,
  },
});

// Create a model for party enrollment
const PartyModel = mongoose.model("Party", partySchema);

// Route to handle party enrollment
app.post("/enroll-party", async (req, res) => {
  try {
    const { partyName, partyLeader, partySymbol } = req.body;

    // Create a new party enrollment document
    const newParty = new PartyModel({
      partyName,
      partyLeader,
      partySymbol,
    });

    // Save the new party enrollment document to the database
    await newParty.save();

    res.json({ message: "Party enrolled successfully" });
  } catch (error) {
    console.error("Error enrolling party:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.get('/parties', async (req, res) => {
  try {
    const parties = await PartyModel.find();
    res.json({ parties });
  } catch (error) {
    console.error('Error fetching parties:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Edit party details
app.put('/parties/:id', async (req, res) => {
  const { id } = req.params;
  const { partyName, partyLeader, partySymbol } = req.body;
  try {
    const updatedParty = await PartyModel.findByIdAndUpdate(id, { partyName, partyLeader, partySymbol }, { new: true });
    res.json({ party: updatedParty });
  } catch (error) {
    console.error('Error updating party:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete party
app.delete("/parties/:partyId", async (req, res) => {
  const partyId = req.params.partyId;
  try {
    // Find the party by ID and delete it from the database
    await PartyModel.findByIdAndDelete(partyId);
    res.status(200).json({ message: "Party deleted successfully" });
  } catch (error) {
    console.error("Error deleting party:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// PUT endpoint to update a party by ID
app.put("/parties/:partyId", async (req, res) => {
  const partyId = req.params.partyId;
  const { partyName, partyLeader, partySymbol } = req.body;

  try {
    // Find the party by ID and update its details
    const updatedParty = await PartyModel.findByIdAndUpdate(partyId, {
      partyName,
      partyLeader,
      partySymbol
    }, { new: true }); // Set { new: true } to return the updated party document

    if (updatedParty) {
      res.status(200).json({ message: "Party updated successfully", party: updatedParty });
    } else {
      res.status(404).json({ message: "Party not found" });
    }
  } catch (error) {
    console.error("Error updating party:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Route to fetch voters
app.get('/voters', async (req, res) => {
  try {
    const voters = await FaceModel.find();
    res.json({ voters });
  } catch (error) {
    console.error('Error fetching voters:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Route to delete a voter
app.delete("/voters/:voterId", async (req, res) => {
  const voterId = req.params.voterId;
  try {
    // Find the voter by ID and delete it from the database
    await FaceModel.findByIdAndDelete(voterId);
    res.status(200).json({ message: "Voter deleted successfully" });
  } catch (error) {
    console.error("Error deleting voter:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


module.exports = app;
