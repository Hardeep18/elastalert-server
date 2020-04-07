import RouteLogger from '../../routes/route_logger';
import {sendRequestError} from '../../common/errors/utils';
import {BodyNotSendError, OptionsInvalidError} from '../../common/errors/silence_request_errors';
import Joi from 'joi';

let logger = new RouteLogger('/silence', 'POST');

const optionsSchema = Joi.object().keys({
  unit: Joi.string().valid('seconds', 'minutes', 'hours', 'days', 'weeks').default('minutes'),
  duration: Joi.number().min(1).default(1),
}).default();

function analyzeRequest(request) {
  if (!request.body) {
    return new BodyNotSendError();
  }

  const validationResult = Joi.validate(request.body, optionsSchema);

  if (validationResult.error) {
    return new OptionsInvalidError(validationResult.error);
  }

  let body = request.body;
  body.unit = validationResult.value.unit;
  body.duration = validationResult.value.duration;

  return body;
}

export default function silencePostHandler(request, response) {
  /**
   * @type {ElastalertServer}
   */
  let server = request.app.get('server');
  let body = analyzeRequest(request);

  if (body.error) {
    logger.sendFailed(body.error);
    sendRequestError(response, body.error);
  }

  let path = request.params.path + request.params[0];

  server.silenceController.silenceRule(path, body.unit, body.duration)
    .then(function (consoleOutput) {
      response.send(consoleOutput);
    })
    .catch(function (consoleOutput) {
      response.status(500).send(consoleOutput);
    });
}
