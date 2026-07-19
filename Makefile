IMAGE := dimssss/nashkort
TAG := latest

.PHONY: build build-amd64 build-arm64 push run

build:
	docker build -t $(IMAGE):$(TAG) .

build-amd64:
	DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t $(IMAGE):$(TAG)-amd64 .

build-arm64:
	DOCKER_DEFAULT_PLATFORM=linux/arm64 docker build -t $(IMAGE):$(TAG)-arm64 .

push: build-amd64 build-arm64
	docker push $(IMAGE):$(TAG)-amd64
	docker push $(IMAGE):$(TAG)-arm64
	docker manifest create $(IMAGE):$(TAG) $(IMAGE):$(TAG)-amd64 $(IMAGE):$(TAG)-arm64 --amend
	docker manifest push $(IMAGE):$(TAG)

run:
	docker run -p 3000:3000 --env-file .env $(IMAGE):$(TAG)
