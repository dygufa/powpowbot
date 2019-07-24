FROM node:argon
MAINTAINER Rodrigo Araujo <hello@dygufa.com>


WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm install

COPY . /app/

CMD [ "npm", "start" ]
