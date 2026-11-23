class NetworkManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest' | null
    this.roomId = '';
    this.isConnected = false;

    this.onConnected = null;
    this.onDisconnected = null;
    this.onData = null;
    this.onError = null;

    this.prefix = 'maimai-skyland-';
    this.chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  }

  generateRoomId() {
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += this.chars.charAt(Math.floor(Math.random() * this.chars.length));
    }
    return id;
  }

  hostRoom(attempt = 0) {
    this.disconnect();
    this.role = 'host';

    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') {
        reject(new Error('通信ライブラリを読み込めませんでした'));
        return;
      }

      const id = this.generateRoomId();
      this.roomId = id;
      const peer = new Peer(this.prefix + id, { debug: 0 });
      this.peer = peer;

      let settled = false;

      peer.on('open', () => {
        settled = true;
        resolve(id);
      });

      peer.on('connection', (conn) => {
        // すでに誰か接続中なら新しい接続は閉じる（2人専用）
        if (this.conn && this.isConnected) {
          conn.on('open', () => conn.close());
          return;
        }
        this._setupConnection(conn);
      });

      peer.on('error', (err) => {
        if (!settled) {
          if (err && err.type === 'unavailable-id' && attempt < 5) {
            peer.destroy();
            this.hostRoom(attempt + 1).then(resolve).catch(reject);
            return;
          }
          settled = true;
          reject(err);
        } else if (this.onError) {
          this.onError(err);
        }
      });
    });
  }

  joinRoom(rawId) {
    this.disconnect();
    this.role = 'guest';
    const cleanId = (rawId || '').trim().toLowerCase();
    this.roomId = cleanId;

    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') {
        reject(new Error('通信ライブラリを読み込めませんでした'));
        return;
      }
      if (!/^[a-z0-9]{6}$/.test(cleanId)) {
        reject(new Error('6桁の小文字英数字を入力してください'));
        return;
      }

      const peer = new Peer(undefined, { debug: 0 });
      this.peer = peer;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.disconnect();
          reject(new Error('接続がタイムアウトしました。IDを確認してください'));
        }
      }, 10000);

      peer.on('open', () => {
        const conn = peer.connect(this.prefix + cleanId, {
          reliable: false
        });
        this._setupConnection(conn, () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve(cleanId);
          }
        });
      });

      peer.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          this.disconnect();
          reject(new Error('ルームが見つからないか、接続できませんでした'));
        } else if (this.onError) {
          this.onError(err);
        }
      });
    });
  }

  _setupConnection(conn, onOpenOnce = null) {
    this.conn = conn;

    conn.on('open', () => {
      this.isConnected = true;
      if (onOpenOnce) onOpenOnce();
      if (this.onConnected) this.onConnected();
    });

    conn.on('data', (data) => {
      if (this.onData) this.onData(data);
    });

    conn.on('close', () => {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      this.conn = null;
      if (wasConnected && this.onDisconnected) {
        this.onDisconnected();
      }
    });

    conn.on('error', (err) => {
      if (this.onError) this.onError(err);
    });
  }

  send(payload) {
    if (this.conn && this.isConnected && this.conn.open) {
      try {
        this.conn.send(payload);
      } catch (e) {
        // 一時的な送信失敗は無視
      }
    }
  }

  disconnect() {
    this.isConnected = false;
    if (this.conn) {
      try {
        this.conn.close();
      } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    this.role = null;
    this.roomId = '';
  }
}