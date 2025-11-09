**chat app**

this is a simple real-time chat application made with react native for the frontend and node.js + express + socket.io for the backend. it allows two users to chat 1 to 1 in real time. it also supports login, register, online status, typing status, message history and read receipts.

**features:**
- user register and login using jwt
- real-time messaging using socket.io
- messages saved in the database
- user list showing online and offline users
- typing indicator when the other person is typing
- message delivered and message read ticks
- chat history loaded when opening the chat
- simple ui for login, user list and chat screen
- can run on android, ios and web

chat app

this is a simple real-time chat application made with react native for the frontend and node.js + express + socket.io for the backend. it allows two users to chat 1 to 1 in real time. it supports login, register, online status, typing status, message history and read receipts.

**features:**
- user register and login using jwt
- real-time messaging using socket.io
- messages saved in the database
- user list showing online and offline users
- typing indicator when the other person is typing
- message delivered and message read ticks
- chat history loaded when opening the chat
- simple ui for login, user list and chat screen
- works on android, ios and web (expo)

**tech used:**
- react native (expo)
- node.js
- express
- socket.io
- mongodb or postgres
- jwt authentication

**api endpoints:**
- post /auth/register
- post /auth/login
- get /users
- get /conversations/:username/messages

**socket events used:**
- message:send
- message:new
- typing:start
- typing:stop
- message:read

**how to run backend:**
- go to server folder
- run: npm install
- run: npm start

**how to run mobile app:**
- go to mobile folder
- run: npm install
- run: npm start

**demo users:**
- alice / 123
- bob / 123

