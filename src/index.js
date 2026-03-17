const express = require("express");
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Job Tracker API is running." });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
