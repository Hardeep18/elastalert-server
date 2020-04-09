#!/bin/bash 

cd ./EK-Docker && docker-compose up --build -d && cd ..

docker-compose -f docker-build.yml up  --build -d

## Client machine --> filebeat

apt-get update
wget https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-7.5.0-amd64.deb
dpkg -i filebeat-7.5.0-amd64.deb
vim /etc/filebeat/filebeat.yml
## define elasticsearch host and kiban 
systemctl enable filebeat
filebeat test config
filebeat test output
filebeat modules list
filebeat modules enable system
filebeat modules list

## system module options
vim /etc/filebeat/modules.d/system.yml
filebeat setup
systemctl start filebeat.service
systemctl status filebeat.service

## Send some message 
logger -t newalert "this is testing from server"