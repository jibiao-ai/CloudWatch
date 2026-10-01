# 构建阶段：静态编译（CGO 关闭），迁移 SQL 已内嵌进二进制
FROM golang:1.22-alpine AS build
WORKDIR /src
ARG GOPROXY=https://goproxy.cn,direct
ENV GOPROXY=$GOPROXY CGO_ENABLED=0 GOFLAGS=-mod=mod
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -trimpath -ldflags="-s -w" -o /out/cloudwatch-api ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
COPY --from=build /out/cloudwatch-api /usr/local/bin/cloudwatch-api
EXPOSE 8080
ENTRYPOINT ["cloudwatch-api"]
