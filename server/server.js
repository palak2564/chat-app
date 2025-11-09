const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const s = http.createServer(app);
const io = socketio(s, {cors: {origin: '*'}});

app.use(express.json());
app.use(cors());

mongoose.connect('mongodb://localhost/chatapp');

// models
const u = mongoose.model('user', {
  username: String,
  password: String,
  online: {type: Boolean, default: false}
});

const m = mongoose.model('message', {
  from: String,
  to: String,
  text: String,
  read: {type: Boolean, default: false},
  delivered: {type: Boolean, default: false},
  ts: {type: Date, default: Date.now}
});

const secret = 'changethislater';

// auth stuff
app.post('/auth/register', async (req, res) => {
  try {
    const {username, password} = req.body;
    const h = await bcrypt.hash(password, 10);
    const nu = await u.create({username, password: h});
    res.json({ok: true, user: {id: nu._id, username: nu.username}});
  } catch(e) {
    res.status(400).json({error: e.message});
  }
});

app.post('/auth/login', async (req, res) => {
  const {username, password} = req.body;
  const user = await u.findOne({username});
  if(!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({error: 'nope'});
  }
  const t = jwt.sign({id: user._id, username}, secret);
  res.json({token: t, user: {id: user._id, username}});
});

// middleware
const auth = (req, res, next) => {
  const t = req.headers.authorization?.split(' ')[1];
  if(!t) return res.status(401).json({error: 'no token'});
  try {
    req.user = jwt.verify(t, secret);
    next();
  } catch(e) {
    res.status(401).json({error: 'bad token'});
  }
};

app.get('/users', auth, async (req, res) => {
  const users = await u.find({_id: {$ne: req.user.id}}, 'username online');
  res.json(users);
});

app.get('/conversations/:id/messages', auth, async (req, res) => {
  const msgs = await m.find({
    $or: [
      {from: req.user.username, to: req.params.id},
      {from: req.params.id, to: req.user.username}
    ]
  }).sort('ts');
  res.json(msgs);
});

// socket stuff
const onlineusers = new Map();

io.use((socket, next) => {
  const t = socket.handshake.auth.token;
  try {
    socket.user = jwt.verify(t, secret);
    next();
  } catch(e) {
    next(new Error('auth failed'));
  }
});

io.on('connection', async (socket) => {
  const username = socket.user.username;
  onlineusers.set(username, socket.id);
  await u.findByIdAndUpdate(socket.user.id, {online: true});
  io.emit('user:status', {username, online: true});

  socket.on('message:send', async (data) => {
    const msg = await m.create({
      from: username,
      to: data.to,
      text: data.text,
      delivered: onlineusers.has(data.to)
    });
    
    const tosocket = onlineusers.get(data.to);
    if(tosocket) {
      io.to(tosocket).emit('message:new', {
        id: msg._id,
        from: username,
        text: data.text,
        ts: msg.ts
      });
    }
    
    socket.emit('message:sent', {id: msg._id, delivered: msg.delivered});
  });

  socket.on('typing:start', (data) => {
    const tosocket = onlineusers.get(data.to);
    if(tosocket) io.to(tosocket).emit('typing:start', {from: username});
  });

  socket.on('typing:stop', (data) => {
    const tosocket = onlineusers.get(data.to);
    if(tosocket) io.to(tosocket).emit('typing:stop', {from: username});
  });

  socket.on('message:read', async (data) => {
    await m.updateMany(
      {_id: {$in: data.ids}},
      {read: true}
    );
    const tosocket = onlineusers.get(data.from);
    if(tosocket) io.to(tosocket).emit('message:read', {ids: data.ids});
  });

  socket.on('disconnect', async () => {
    onlineusers.delete(username);
    await u.findByIdAndUpdate(socket.user.id, {online: false});
    io.emit('user:status', {username, online: false});
  });
});

s.listen(3000, () => console.log('running on 3000'));