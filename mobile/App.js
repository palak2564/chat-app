// App.js
import React, { useEffect, useRef, useState } from 'react';
import { Platform } from "react-native";

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
} from 'react-native';
import io from 'socket.io-client';

const API = Platform.OS === "web"
  ? "http://localhost:3000"
  : "http://192.168.1.7:3000";

let socket = null;

export default function App() {
  const [page, setPage] = useState('login'); // 'login' | 'users' | { chat: username }
  const [token, setToken] = useState(null);
  const [me, setMe] = useState(null);

  // Connect socket after login
  useEffect(() => {
    if (!token) return;

    // ensure only one connection
    if (socket) {
      try { socket.disconnect(); } catch {}
      socket = null;
    }

    socket = io(API, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
    });

    socket.on('connect_error', (err) => {
      console.log('socket error:', err?.message);
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
          setPage('users');
        }}
      />
    );
  }

  if (page === 'users') {
    return <UserList token={token} me={me} onChat={(u) => setPage({ chat: u })} />;
  }

  if (page && typeof page === 'object' && page.chat) {
    return (
      <ChatScreen
        token={token}
        me={me}
        other={page.chat}
        onBack={() => setPage('users')}
      />
    );
  }

  return null;
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isReg, setIsReg] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Enter username and password');
      return;
    }
    setBusy(true);
    try {
      const ep = isReg ? '/auth/register' : '/auth/login';
      const r = await fetch(API + ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await r.json();
console.log("LOGIN RESPONSE:", d, "status:", r.status);

if (r.ok && d.token) {
  onLogin(d.token, d.user);
} else {
  Alert.alert("Login failed", JSON.stringify(d));
}

    } catch (e) {
      Alert.alert('Network error', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{isReg ? 'register' : 'login'}</Text>

      <TextInput
        placeholder="username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        placeholder="password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity onPress={submit} style={styles.primaryBtn} disabled={busy}>
        <Text style={styles.primaryBtnText}>{isReg ? 'signup' : 'login'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsReg(!isReg)} style={{ marginTop: 10 }}>
        <Text style={styles.linkText}>
          {isReg ? 'have account? login' : 'need account? signup'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function UserList({ token, me, onChat }) {
  const [users, setUsers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadUsers = async () => {
    setRefreshing(true);
    try {
      const r = await fetch(API + '/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('users error', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadUsers();

    if (!socket) return;
    const onStatus = (data) => {
      setUsers((prev) =>
        prev.map((u) =>
          u.username === data.username ? { ...u, online: data.online } : u
        )
      );
    };
    socket.on('user:status', onStatus);

    return () => {
      if (socket) socket.off('user:status', onStatus);
    };
  }, [token]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={[styles.title, { paddingHorizontal: 20 }]}>chats</Text>
      <FlatList
        data={users}
        refreshing={refreshing}
        onRefresh={loadUsers}
        keyExtractor={(i) => String(i._id || i.username)}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item: u }) => (
          <TouchableOpacity onPress={() => onChat(u.username)} style={{ padding: 15 }}>
            <Text style={{ fontSize: 18 }}>
              {u.username} {u.online ? '🟢' : '⚫'}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ padding: 20, color: '#666' }}>
            No other users yet. Log in on another phone as “bob” to start chatting.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function ChatScreen({ token, me, other, onBack }) {
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const r = await fetch(`${API}/conversations/${other}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        if (mounted) setMsgs(Array.isArray(data) ? data : []);
      } catch (e) {
        console.log('load msgs error', e);
      }
    })();

    if (!socket) return;

    const onNew = (data) => {
      // data: { id, from, text, ts }
      setMsgs((prev) => [
        ...prev,
        { _id: data.id, from: data.from, to: me.username, text: data.text, ts: data.ts },
      ]);
      socket.emit('message:read', { from: data.from, ids: [data.id] });
    };
    const onTypeStart = (data) => { if (data.from === other) setTyping(true); };
    const onTypeStop = (data) => { if (data.from === other) setTyping(false); };
    const onRead = (data) => {
      setMsgs((prev) =>
        prev.map((m) => (m._id && data.ids.includes(m._id) ? { ...m, read: true } : m))
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
      mounted = false;
    };
  }, [other, token]);

  const send = () => {
    const text = txt.trim();
    if (!text) return;

    // optimistic bubble
    const tempId = `temp-${Date.now()}`;
    setMsgs((prev) => [
      ...prev,
      {
        _id: tempId,
        from: me.username,
        to: other,
        text,
        ts: new Date().toISOString(),
        delivered: false,
        read: false,
        _temp: true,
      },
    ]);

    // send to server
    socket.emit('message:send', { to: other, text });

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
          <Text style={{ fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, marginLeft: 6 }}>{other}</Text>
      </View>

      <FlatList
        data={msgs}
        keyExtractor={(item, idx) => String(item._id || idx)}
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
                <Text style={{ fontSize: 10, color: 'white', marginTop: 4 }}>
                  {msg.read ? '✓✓' : msg.delivered ? '✓' : '○'}
                </Text>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ padding: 20, color: '#666' }}>No messages yet. Say hi 👋</Text>
        }
      />

      {typing && (
        <Text style={{ padding: 5, fontSize: 12, color: 'gray' }}>typing...</Text>
      )}

      <View style={styles.inputRow}>
        <TextInput
          value={txt}
          onChangeText={handleType}
          placeholder="message..."
          style={styles.textbox}
        />
        <TouchableOpacity onPress={send} style={styles.sendBtn}>
          <Text style={{ color: 'white' }}>send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  title: { fontSize: 24, marginBottom: 20, textAlign: 'left' },
  input: { borderWidth: 1, padding: 10, marginBottom: 10, borderRadius: 8 },
  primaryBtn: { backgroundColor: '#007aff', padding: 15, borderRadius: 8 },
  primaryBtnText: { color: 'white', textAlign: 'center', fontWeight: '600' },
  linkText: { color: '#007aff' },
  separator: { height: 1, backgroundColor: '#eee' },
  topBar: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubble: { padding: 10, borderRadius: 10, marginVertical: 5, maxWidth: '70%' },
  inputRow: { flexDirection: 'row', padding: 10, alignItems: 'center' },
  textbox: { flex: 1, borderWidth: 1, padding: 10, borderRadius: 20 },
  sendBtn: {
    marginLeft: 10,
    backgroundColor: '#007aff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
});
