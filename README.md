# get barcodes

## Purpose

회사에서 대량의 바코드 이미지를 하나하나 다운로드 받아야 하는 반복 동작을 줄이기 위해 개발.

## How to use

1. `Node.js`가 설치되어 있는지 확인
   1. 확인 방법
      1. Spotlight 실행
      1. `terminal` 검색해서 실행
      1. `node --version`을 실행했을 때, `v16.13.1`과 같이 버전명이 나온다면 OK.
    1. 설치되어 있지 않다면, [다운로드 | Node.js](https://nodejs.org/ko/download/)에서 LTS 버전 다운로드 후 설치
2. [gitHub](https://github.com/oks234/get_barcodes)에서 Code download 후 원하는 경로에 압축 해제 (=프로젝트 경로)
3. 프로젝트 경로에 제공 받은 `configs.txt`를 넣거나, 직접 작성.
4. terminal에서 프로젝트 경로로 이동 `cd [경로명]`과 `ls`를 활용.
5. termnial에서 `npm install`을 실행해서 패키지 파일 설치.
6. terminal에서 `node main.js` 실행.
7. dist라는 폴더에 바코드 이미지 저장.
