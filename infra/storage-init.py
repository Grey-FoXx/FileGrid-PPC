import os, time, boto3
from botocore.exceptions import ClientError

s = boto3.client(
    "s3",
    endpoint_url="http://minio:9000",
    aws_access_key_id=os.environ["S3_ACCESS_KEY"],
    aws_secret_access_key=os.environ["S3_SECRET_KEY"],
    region_name="us-east-1",
)
for attempt in range(60):
    try:
        try:
            s.head_bucket(Bucket="filegrid")
        except ClientError:
            s.create_bucket(Bucket="filegrid")
        s.put_bucket_versioning(
            Bucket="filegrid", VersioningConfiguration={"Status": "Enabled"}
        )
        s.delete_bucket_policy(
            Bucket="filegrid"
        )  # No anonymous policy: private by default in MinIO.
        print("Private versioned bucket ready")
        break
    except Exception:
        if attempt == 59:
            raise
        time.sleep(2)
