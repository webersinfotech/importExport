const {google} = require('googleapis');
const mime = require('mime-types');
const FS = require('fs');
const path = require('path');
const { uuid } = require('uuidv4');
const fileExtension = require('file-extension');

class googleDrive {
    constructor() {
        this.currentDir;
        this.driveCurrentDirId;
        this.driveClient;
        console.log(path.join(__dirname, 'level-calculus-319403-dfdee0a2c3d9.json'));
    }

    async useServiceAccount() {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, 'level-calculus-319403-dfdee0a2c3d9.json'),
            scopes: ['https://www.googleapis.com/auth/drive']
            // https://www.googleapis.com/auth/drive
        })
        // google.options(auth);
        this.driveClient = google.drive({ version: 'v3', auth: auth });
    }

    getMimeType(path) {
        return mime.lookup(path);
    }

    deleteLocalFile(path) {
        return FS.unlinkSync(path);
    }

    deleteDirWithContent(path) {
        return FS.rmdirSync(path, { recursive: true });
    }

    async makeDriveDir(name, parentId) {
        var driveDirMetadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents' : [parentId]
        };

        try {
            const dirData = await this.driveClient.files.create({
                resource: driveDirMetadata
            });

            return dirData;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    makeDir(name, path) {
        return FS.mkdirSync(path + '/' + name);
    }

    setCurrentDir(path) {
        if (FS.existsSync(path)) {
            this.currentDir = path;
            return;
        }
        throw 'Given path is not exist';
    }

    setDriveCurrentDirId(id) {
        this.driveCurrentDirId = id;
    }

    async listDir() {
        try {
            const dirs = await this.driveClient.files.list({
                q: "mimeType='application/vnd.google-apps.folder'"
            });

            return dirs;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async listFile() {
        try {
            const files = await this.driveClient.files.list();

            return files;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async deleteFileOrDir(id) {
        try {
            const data = await this.driveClient.files.delete({
                'fileId': id
            });

            return data;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async uploadFile(path, isSharableLink) {
        try {
            const fileMetadata = {
                'name': this.generateUUID() + '.' + this.getExtension(path),
                'parents' : [this.driveCurrentDirId]
            };
    
            const media = {
                mimeType: this.getMimeType(path),
                body: FS.createReadStream(path)
            };

            const data = await this.driveClient.files.create({
                resource: fileMetadata,
                media: media
            });

            if (isSharableLink) {
                this.makePublicAccess(data.data.id);
                const sharableLink = await this.getSharableLink(data.data.id);
                return sharableLink.data.webViewLink;
            }

            return data;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async getSharableLink(id) {
        try {
            const data = await this.driveClient.files.get({
                fileId: id,
                fields: 'webViewLink'
            });

            return data;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async makePublicAccess(id) {
        try {
            const data = await this.driveClient.permissions.create({
                fileId: id,
                requestBody: {
                    role: 'reader',
                    type: 'anyone',
                }
            });

            return data;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    getExtension(path) {
        return fileExtension(path);
    }

    generateUUID() {
        return uuid();
    }
};

module.exports = googleDrive;