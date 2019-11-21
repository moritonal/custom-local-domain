# custom-local-domain

Proxy that lets you create custom domains locally that are proxied to a specific target.

## Usage
```
npx custom-local-domain start home.dev=127.0.0.1:8080
```

##### Add a local port
```
npx custom-local-domain add another.dev=127.0.0.1:8091
```

##### Add a local directory
```
npx custom-local-domain add localdirectory.dev=./dist
```

##### List the current domains
```
npx custom-local-domain list
```

##### Clear the extra domains
```
npx custom-local-domain clear
```
