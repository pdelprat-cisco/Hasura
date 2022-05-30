"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");

const appName = 'pdelprat-hasura';

// create my ecs cluster
const cluster = new awsx.ecs.Cluster(`${appName}-cluster`);

// create a loadbalancer to simplify Route 53 alias creation
const alb = new awsx.elasticloadbalancingv2.ApplicationLoadBalancer(
  `${appName}-lb`,
  {
    external: true,
    securityGroups: cluster.securityGroups,
  }
);

// need to customize default target group, to change health check path from / to /console
const atg = alb.createTargetGroup(`${appName}-tg`, {
  port: 8080,
  deregistrationDelay: 0,
  healthCheck: { path: '/console' },
});

// define a listener for my load balancer
const web = atg.createListener(`${appName}-web`, {
  port: 8080,
  protocol: 'HTTP',
});

// create a fargate service and define task definition
let service = new awsx.ecs.FargateService(`${appName}-fargate`, {
  cluster,
  desiredCount: 1,
  taskDefinitionArgs: {
    containers: {
      hasura: {
        image: awsx.ecs.Image.fromPath(`${appName}-image`, './app'),
        memory: 512,
        portMappings: [web],
      },
    },
  },
});

// Catch the zoneId for standard loadbalancer in aws for eu-west-3 region
const elbZone = aws.elb.getHostedZoneId({
  region: 'eu-west-3',
});

// Catch the zoneId for my created domain dp-tuto.com
const dpTutoZone = aws.route53.getZone({
  name: 'dp-tuto.com',
  privateZone: false,
});

// Create a alias to use a human readable fqdn on my personal domain
const record = new aws.route53.Record(`${appName}-route`, {
  zoneId: dpTutoZone.then((dpTutoZone) => dpTutoZone.zoneId),
  name: `${appName}.dp-tuto.com`,
  type: 'A',
  aliases: [
    {
      name: web.endpoint.hostname,
      zoneId: elbZone.then((elbZone) => elbZone.id),
      evaluateTargetHealth: true,
    },
  ],
});

// output the original hostname fqdn, but you can use pdelprat-hasura.dp-tuto.com, thanks alias
exports.frontendURL = pulumi.interpolate`http://${web.endpoint.hostname}/`;

