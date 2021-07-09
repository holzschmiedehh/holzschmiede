'use strict';

const SftpClient = require('ssh2-sftp-client');


const localBuildDir = './build/';
const remotePath = '/holzschmiede';
const remoteGlob = remotePath + '/**/*';
const sftp = new SftpClient();


sftp.connect({
    host: process.env.SFTP_SITE,
    port: process.env.SFTP_PORT,
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD
 }).then(() => {
      return sftp.uploadDir(localBuildDir, './');
 }).catch((err) => {
    console.log(err.message);
 }).finally(() => {
    return sftp.end();
 });
 