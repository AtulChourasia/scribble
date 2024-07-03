const express = require("express");
const cors = require("cors");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

// Create the HTTP server
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: "*",
  },
  connectionStateRecovery: {},
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the React app (build folder)
app.use(express.static(path.join(__dirname, "build")));

// Serve the React app for any unknown routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// Get port from environment variables
const port = process.env.PORT || 3001;

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Game logic variables
const chats = [];
const players = [];
let word;
let drawerIndex = 0;
let timeout;
let round = 0;
let playerGuessedRightWord = [];

// Game logic functions
const startGame = () => {
  console.log("game started");
  io.emit("game-start", {});
  startTurn();
};

const stopGame = () => {
  console.log("game stopped");
  io.emit("game-stop", {});
  drawerIndex = 0;
  if (timeout) {
    clearInterval(timeout);
  }
};

const startTurn = () => {
  if (drawerIndex >= players.length) {
    drawerIndex = 0;
  }
  io.emit("start-turn", players[drawerIndex]);
};

const startDraw = () => {
  io.emit("start-draw", players[drawerIndex]);
  timeout = setTimeout(() => {
    endTurn();
  }, 60000);
};

const endTurn = () => {
  io.emit("end-turn", players[drawerIndex]);
  playerGuessedRightWord = [];
  clearInterval(timeout);
  drawerIndex = (drawerIndex + 1) % players.length;
  startTurn(drawerIndex);
};

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("connected to socket.io");
  console.log("user connected", socket.id);

  console.log("player joined with id", socket.id);

  io.to(socket.id).emit("send-user-data", {});

  socket.on("recieve-user-data", ({ username, avatar }) => {
    let newUser = {
      id: socket.id,
      name: username,
      points: 0,
      avatar: avatar,
    };
    players.push(newUser);
    console.log(players);
    io.emit("updated-players", players);

    if (players.length == 2) {
      startGame();
    }
    if (players.length >= 2) {
      io.emit("game-already-started", {});
    }
  });

  socket.on("sending", (data) => {
    console.log("data received");
    socket.broadcast.emit("receiving", data);
  });

  socket.on("sending-chat", (inputMessage) => {
    const userID = socket.client.sockets.keys().next().value;
    console.log(userID);
    console.log("chat received", inputMessage);
    const index = players.findIndex((play) => play.id === userID);
    let rightGuess = false;
    if (word && inputMessage && inputMessage.toLowerCase() === word.toLowerCase()) {
      console.log("right guess");
      rightGuess = true;

      if (index > -1) {
        players[index].points += 100;
      }
      chats.push(`${userID} Guessed the right word`);
    } else {
      chats.push(inputMessage);
    }
    let returnObject = {
      msg: inputMessage,
      player: players[index],
      rightGuess: rightGuess,
      players: players,
    };
    io.emit("receive-chat", returnObject);

    if (rightGuess) {
      let u = playerGuessedRightWord.filter((pla) => pla === userID);
      console.log("u", u);
      if (u.length == 0) {
        playerGuessedRightWord.push(userID);
        if (playerGuessedRightWord.length === players.length - 1) {
          io.emit("all-guessed-correct", {});
          playerGuessedRightWord = [];
          endTurn();
        }
      }
    }
  });

  socket.on("word-select", (w) => {
    word = w;
    let wl = w.length;
    io.emit("word-len", wl);
    startDraw();
  });

  socket.on("disconnect", (reason) => {
    console.log(reason);
    console.log("USER DISCONNECTED IN DISCONNECT", socket.id);
    const index = players.findIndex((play) => play.id === socket.id);
    console.log(index);
    if (index > -1) {
      players.splice(index, 1);
    }
    io.emit("updated-players", players);
    io.to(socket.id).emit("user-disconnected", {});
    if (players.length <= 1) {
      stopGame();
    }
  });
});

module.exports = app;
