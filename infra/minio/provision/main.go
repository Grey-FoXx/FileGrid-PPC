package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/minio/madmin-go/v3"
)

const appPolicy = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts"
    ],
    "Resource": ["arn:aws:s3:::filegrid/*"]
  }]
}`

func required(name string) string {
	value := os.Getenv(name)
	if value == "" {
		fmt.Fprintf(os.Stderr, "required environment variable %s is empty\n", name)
		os.Exit(2)
	}
	return value
}

func main() {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "minio:9000"
	}
	rootUser, rootPassword := required("MINIO_ROOT_USER"), required("MINIO_ROOT_PASSWORD")
	appKey, appSecret := required("S3_ACCESS_KEY"), required("S3_SECRET_KEY")
	if appKey == rootUser || appSecret == rootPassword {
		fatal(errors.New("MinIO application credentials must be distinct from root credentials"))
	}
	admin, err := madmin.New(endpoint, rootUser, rootPassword, false)
	if err != nil {
		fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	var lastErr error
	for attempt := 1; attempt <= 60; attempt++ {
		if err = admin.AddCannedPolicy(ctx, "filegrid-app", []byte(appPolicy)); err == nil {
			err = admin.SetUser(ctx, appKey, appSecret, madmin.AccountEnabled)
		}
		if err == nil {
			_, err = admin.AttachPolicy(ctx, madmin.PolicyAssociationReq{
				Policies: []string{"filegrid-app"},
				User:     appKey,
			})
			// MinIO reports a repeated, already-applied attachment as HTTP 400.
			// It is an idempotent success, not a provisioning outage.
			if madmin.ToErrorResponse(err).Code == "XMinioAdminPolicyChangeAlreadyApplied" {
				err = nil
			}
		}
		if err == nil {
			fmt.Println("Restricted FileGrid S3 application account provisioned")
			return
		}
		lastErr = err
		time.Sleep(2 * time.Second)
	}
	fatal(lastErr)
}

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "MinIO application-account provisioning failed: %v\n", err)
	os.Exit(1)
}
