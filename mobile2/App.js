// App.js (FINAL FIXED VERSION)

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import io from 'socket.io-client';

const API = 'http://192.168.1.7:3000';  // <-- your backend IP
export let socket = null;

// -------------------------------------------------------
// MAIN APP
// -------------------------------------------------------
export default function App() {
  const [page, setPage] = useState('login');
  const [token, setToken] = useState(null);
  const [me, setMe] = useState(null);

  // connect socket after login
  useEffect(() => {
    if (!token) return;

    // kill previous socket if any
    if (socket) {
      try { socket.disconnect(); } catch {}
      socket = null;
    }

    // create socket
    socket = io(API, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
    });

    socket.on('connect_error', (err) => {
      console.log('Socket connect error:', err.message);
    });

    return () => {
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
      }
    };
  }, [token]);

  if (page === 'login') {
    return (
      <LoginScreen
        onLogin={(t, u) => {
          setToken(t);
          setMe(u);

          // force socket creation right away
          socket = io(API, {
            auth: { token: t },
            transports: ['websocket'],
            reconnection: true,
          });

          setPage('users');
        }}
      />
    );
  }

  if (page === 'users') {
    return <UserList token={token} me={me} onChat={(u) => setPage({ chat: u })} />;
  }

  if (page.chat) {
    return <ChatScreen token={token} me={me} other={page.chat} onBack={() => setPage('users')} />;
  }

  return null;
}

// -------------------------------------------------------
// LOGIN SCREEN
// -------------------------------------------------------
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isReg, setIsReg] = useState(false);

  const submit = async () => {
    if (!username || !password) return;

    const ep = isReg ? '/auth/register' : '/auth/login';

    const r = await fetch(API + ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const d = await r.json();
    console.log("login response:", d);
    if (d.token) onLogin(d.token, d.user);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{isReg ? 'register' : 'login'}</Text>

      <TextInput
        placeholder="username"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
      />

      <TextInput
        placeholder="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      <TouchableOpacity onPress={submit} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>{isReg ? 'signup' : 'login'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsReg(!isReg)} style={{ marginTop: 15 }}>
        <Text style={styles.linkText}>
          {isReg ? 'have account? login' : 'need account? signup'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// -------------------------------------------------------
// USER LIST SCREEN
// -------------------------------------------------------
function UserList({ token, me, onChat }) {
  if (!socket) return null; // IMPORTANT FIX

  const [users, setUsers] = useState([]);

  useEffect(() => {
    const loadUsers = async () => {
      const r = await fetch(`${API}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      console.log("USERS:", data);
      setUsers(data);
    };

    loadUsers();

    const status = (data) => {
      setUsers((prev) =>
        prev.map((u) =>
          u.username === data.username ? { ...u, online: data.online } : u
        )
      );
    };

    socket.on('user:status', status);

    return () => {
      socket.off('user:status', status);
    };
  }, [token]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={[styles.title, { paddingHorizontal: 20 }]}>chats</Text>

      <FlatList
        data={users}
        keyExtractor={(i) => String(i._id)}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item: u }) => (
          <TouchableOpacity onPress={() => onChat(u.username)} style={{ padding: 15 }}>
            <Text style={{ fontSize: 18 }}>
              {u.username} {u.online ? '🟢' : '⚫'}
            </Text>
          </TouchableOpacity>
        )}
      />

      {users.length === 0 && (
        <Text style={{ padding: 20, textAlign: 'center', color: '#777' }}>
          Login as bob on web/emulator to see a user.
        </Text>
      )}
    </SafeAreaView>
  );
}

// -------------------------------------------------------
// CHAT SCREEN
// -------------------------------------------------------
function ChatScreen({ token, me, other, onBack }) {
  if (!socket) return null; // IMPORTANT FIX

  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef(null);

  useEffect(() => {
    // load messages
    fetch(`${API}/conversations/${other}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setMsgs(data));

    // socket listeners
    const onNew = (data) => {
      setMsgs((prev) => [...prev, data]);
      socket.emit('message:read', { from: data.from, ids: [data.id] });
    };

    const onTypeStart = (d) => { if (d.from === other) setTyping(true); };
    const onTypeStop = (d) => { if (d.from === other) setTyping(false); };

    const onRead = (d) => {
      setMsgs((prev) =>
        prev.map((m) =>
          d.ids.includes(m._id) ? { ...m, read: true } : m
        )
      );
    };

    socket.on('message:new', onNew);
    socket.on('typing:start', onTypeStart);
    socket.on('typing:stop', onTypeStop);
    socket.on('message:read', onRead);

    return () => {
      socket.off('message:new', onNew);
      socket.off('typing:start', onTypeStart);
      socket.off('typing:stop', onTypeStop);
      socket.off('message:read', onRead);
    };
  }, [other]);

  const send = () => {
    if (!txt.trim()) return;

    socket.emit('message:send', { to: other, text: txt });

    setMsgs((prev) => [
      ...prev,
      {
        _id: Date.now().toString(),
        from: me.username,
        to: other,
        text: txt,
        ts: new Date(),
        delivered: true,
      },
    ]);

    setTxt('');
    socket.emit('typing:stop', { to: other });
  };

  const handleType = (t) => {
    setTxt(t);

    if (t) socket.emit('typing:start', { to: other });

    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing:stop', { to: other });
    }, 900);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, marginLeft: 10 }}>{other}</Text>
      </View>

      <FlatList
        data={msgs}
        keyExtractor={(i, idx) => i._id || String(idx)}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item: msg }) => {
          const mine = msg.from === me.username;
          return (
            <View
              style={[
                styles.bubble,
                {
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  backgroundColor: mine ? '#007aff' : '#e5e5ea',
                },
              ]}
            >
              <Text style={{ color: mine ? 'white' : 'black' }}>{msg.text}</Text>
              {mine && (
                <Text style={{ fontSize: 10, color: 'white', marginTop: 3 }}>
                  {msg.read ? '✓✓' : msg.delivered ? '✓' : '○'}
                </Text>
              )}
            </View>
          );
        }}
      />

      {typing && (
        <Text style={{ paddingHorizontal: 20, color: 'gray' }}>typing...</Text>
      )}

      <View style={styles.inputRow}>
        <TextInput
          placeholder="message..."
          value={txt}
          onChangeText={handleType}
          style={styles.textbox}
        />
        <TouchableOpacity onPress={send} style={styles.sendBtn}>
          <Text style={{ color: 'white' }}>send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// -------------------------------------------------------
// STYLES
// -------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  title: { fontSize: 26, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#007aff',
    padding: 15,
    borderRadius: 10,
  },
  primaryBtnText: { color: 'white', textAlign: 'center', fontSize: 16 },
  linkText: { color: '#007aff', textAlign: 'center', marginTop: 10 },
  separator: { height: 1, backgroundColor: '#ddd' },
  topBar: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubble: {
    padding: 10,
    borderRadius: 10,
    marginVertical: 5,
    maxWidth: '70%',
  },
  inputRow: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  textbox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    padding: 10,
  },
  sendBtn: {
    marginLeft: 10,
    backgroundColor: '#007aff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
});
