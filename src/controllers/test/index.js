import Logger from '../../common/logger';
import FileSystem from '../../common/file_system';
import config from '../../common/config';
import os from 'os';
import cpuStat from 'cpu-stat';
import ws from 'ws';
import path from 'path';
import randomstring from 'randomstring';
import {spawn} from 'child_process';

let logger = new Logger('TestController');
let fileSystem = new FileSystem();

export default class TestController {
  constructor(server) {
    this._server = server;
    this._elastalertPath = config.get('elastalertPath');
    this.testFolder = this._getTestFolder();

    fileSystem.createDirectoryIfNotExists(this.testFolder).catch(function (error) {
      logger.error(`Failed to create the test folder in ${this.testFolder} with error:`, error);
    });
  }

  testRule(rule, options, socket) {
    const self = this;
    let tempFileName = '~' + randomstring.generate() + '.temp';
    let tempFilePath = path.join(self.testFolder, tempFileName);

    return new Promise(function (resolve, reject) {
      fileSystem.writeFile(tempFilePath, rule)
        .then(function () {
          let processOptions = [];
          let stdoutLines = [];
          let stderrLines = [];

          processOptions.push('-m', 'elastalert.test_rule', '--config', 'config.yaml', tempFilePath);

          if (options.start && options.end) {
            processOptions.push('--start', options.start);
            processOptions.push('--end', options.end);
          } else {
            processOptions.push('--days', options.days);
          }

          if (options.format === 'json') {
            processOptions.push('--formatted-output');
          }

          if (options.maxResults > 0) {
            processOptions.push('--max-query-size');
            processOptions.push(options.maxResults);
          }

          if (options.alert) {
            processOptions.push('--alert');
          }

          switch (options.testType) {
            case 'schemaOnly':
              processOptions.push('--schema-only');
              break;
            case 'countOnly':
              processOptions.push('--count-only');
              break;
          }


          try {
            let testProcess = spawn('python3', processOptions, {
              cwd: self._elastalertPath
            });

            // When the websocket closes we kill the test process
            // so it doesn't keep running detached
            if (socket) {
              let interval = setInterval(() => {
                cpuStat.usagePercent((err, percent) => {
                  if (err) {
                    return console.error(err);
                  }
            
                  if (socket && socket.readyState === ws.OPEN) {
                    socket.send(JSON.stringify({ 
                      event: 'stats',
                      data: { 
                        cpu: percent, 
                        mem: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100, 
                      } 
                    }));        
                  }
                  else {
                    clearInterval(interval);
                  }
    
                });
              }, 1000);
    
              socket.on('close', () => {
                testProcess.kill();
              });
            }
              
            testProcess.stdout.on('data', function (data) {
              if (socket && socket.readyState === ws.OPEN) {
                // clean up output noise introduced in newer versions of elastalert
                let dataStr = data.toString();
                dataStr = dataStr.replace(/\d rules loaded\n/, '');
                dataStr = dataStr.replace(/Didn't get any results.\n/, '');

                socket.send(JSON.stringify({ 
                  event: 'result',
                  data: dataStr
                }));
              }

              stdoutLines.push(data.toString());
            });

            testProcess.stderr.on('data', function (data) {
              if (socket && socket.readyState === ws.OPEN) {
                // clean up output noise from newer version of elastalert
                if (!data.toString().startsWith('INFO:apscheduler.scheduler:Adding job tentatively')) {
                  socket.send(JSON.stringify({ 
                    event: 'progress',
                    data: data.toString() 
                  }));  
                }
              }

              stderrLines.push(data.toString());
            });

            testProcess.on('exit', function (statusCode) {
              if (statusCode === 0) {
                if (options.format === 'json') {
                  resolve(stdoutLines.join(''));
                }
                else {
                  resolve(stdoutLines.join('\n'));
                }
              } else {
                if (!socket) {
                  reject(stderrLines.join('\n'));
                  logger.error(stderrLines.join('\n'));  
                }
              }

              fileSystem.deleteFile(tempFilePath)
                .catch(function (error) {
                  logger.error(`Failed to delete temporary test file ${tempFilePath} with error:`, error);
                });
            });
          } catch (error) {
            logger.error(`Failed to start test on ${tempFilePath} with error:`, error);
            reject(error);
          }
        })
        .catch(function (error) {
          logger.error(`Failed to write file ${tempFileName} to ${self.testFolder} with error:`, error);
          reject(error);
        });
    }).catch((error) => {
      logger.error('Failed to test rule with error:', error);
    });
  }

  _getTestFolder() {
    return path.join(this._server.getDataFolder(), 'tests');
  }
}
