'use strict';

const SftpClient = require('ssh2-sftp-client');

//
// variables
//
const localBuildDir = './build/';
const remotePath = '/holzschmiede';
const remoteGlob = remotePath + '/**/*';
const sftp = new SftpClient();


// remove dir before upload in order to avoid problems
/*sftp.connect({
    host: process.env.FTP_HOST,
    port: process.env.FTP_PORT,
    user: process.env.FTP_USERNAME,
    password: process.env.FTP_PASSWORD
}).then(() => {
    return sftp.rmdir(remotePath, true);
}).then((msg) => {
    console.log('remove-dir task reports: ', msg);
}).then(() => {
    sftp.end(); // TODO: upgrade to node 10 so finally can be used instead
}).catch((err) => {
    console.log('error occured in remove-dir: ', err);
});*/

sftp.connect({
    host: process.env.SFTP_SITE,
    port: process.env.SFTP_PORT,
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD
 }).then(() => {
      return sftp.uploadDir(localBuildDir, './');
 }).then(() => {
    return sftp.end();
 }).catch((err) => {
    console.log(err.message);
 });
 