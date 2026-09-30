// Package secrets 用 AES-256-GCM 加密存库的第三方密钥（告警渠道的 SMTP 授权码 / Webhook 签名密钥）。
// 主密钥优先取环境变量 CW_SECRET_KEY；未提供时首次启动随机生成并保存在 system_meta。
// 密钥类字段任何接口都不回显，只返回 secretSet 布尔值。
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
)

type Box struct{ aead cipher.AEAD }

func New(key []byte) (*Box, error) {
	sum := sha256.Sum256(key)
	blk, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	g, err := cipher.NewGCM(blk)
	if err != nil {
		return nil, err
	}
	return &Box{aead: g}, nil
}

func (b *Box) Seal(plain string) ([]byte, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return b.aead.Seal(nonce, nonce, []byte(plain), nil), nil
}

func (b *Box) Open(data []byte) (string, error) {
	n := b.aead.NonceSize()
	if len(data) < n {
		return "", errors.New("密文损坏")
	}
	p, err := b.aead.Open(nil, data[:n], data[n:], nil)
	if err != nil {
		return "", errors.New("密钥解密失败（主密钥可能已变更）")
	}
	return string(p), nil
}

// Load 读取/生成主密钥并返回 Box。
func Load(d *sql.DB, envKey string) (*Box, error) {
	if envKey != "" {
		return New([]byte(envKey))
	}
	var v string
	err := d.QueryRow(`SELECT v FROM system_meta WHERE k='secret_key'`).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		raw := make([]byte, 32)
		if _, err := rand.Read(raw); err != nil {
			return nil, err
		}
		v = base64.StdEncoding.EncodeToString(raw)
		if _, err := d.Exec(`INSERT INTO system_meta(k,v,updated_at) VALUES('secret_key',?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE k=k`, v); err != nil {
			return nil, err
		}
		// 并发启动时以库里最终值为准
		if err := d.QueryRow(`SELECT v FROM system_meta WHERE k='secret_key'`).Scan(&v); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	return New([]byte(v))
}
