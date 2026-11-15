-- Bounded durable multipart staging for Database and FTP. S3 retains native multipart.
CREATE TABLE blob_chunks (
 storage_key VARCHAR(150) NOT NULL,
 part_number INT NOT NULL CHECK (part_number > 0),
 content BYTEA NOT NULL,
 PRIMARY KEY(storage_key, part_number)
);
