#!/bin/sh

cd /home/ubuntu/responsiveye
git stash
git checkout master
git pull origin master
/usr/local/bin/aws s3 cp s3://responsiveyeconfig/downloadPageScript.js /home/ubuntu/responsiveye/resources/
/usr/local/bin/aws s3 cp s3://responsiveyeconfig/anomaly-detection-autoencoder-test.py /home/ubuntu/responsiveye/resources/

tmux new-session -d -s server
tmux send-keys -t server:0 'sudo su ubuntu' C-m
tmux send-keys -t server:0 'npm run devstart' C-m

if [ "$1" == "website" ]
then
  tmux new-session -d -s vue
  tmux send-keys -t vue:0 'sudo su ubuntu' C-m
  tmux send-keys -t vue:0 'cd /home/ubuntu/responsiveye-vue' C-m
  tmux send-keys -t vue:0 'git stash' C-m
  tmux send-keys -t vue:0 'git pull origin master' C-m
  tmux send-keys -t vue:0 'npm i' C-m
  tmux send-keys -t vue:0 'npm run production' C-m
else
  tmux new-session -d -s worker
  tmux send-keys -t worker:0 'sudo su ubuntu' C-m
  tmux send-keys -t worker:0 'npm run worker queueName=$QUEUE_NAME' C-m
fi
