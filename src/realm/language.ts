import CodeGenerator from '../utilities/CodeGenerator';

import { join, wrap } from '../utilities/printing';

import {
  GraphQLType,
  isOutputType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLField,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInt,
  GraphQLFloat,
  GraphQLEnumType,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull
} from 'graphql';

import {
  optionalVariableDeclarator,
  nonOptionalVariableDeclarator,
  builtInScalarMap
} from './helpers'

export interface Class {
  className: string;
  modifiers: string[];
  superClass?: string;
  adoptedProtocols?: string[];
}

export interface Struct {
  structName: string;
  adoptedProtocols?: string[];
  description?: string;
}

export interface Protocol {
  protocolName: string;
  adoptedProtocols?: string[];
}

export interface Property {
  propertyName: string;
  typeName: string;
  type: GraphQLType;
  description?: string;
}

export function escapedString(string: string) {
  return string.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// prettier-ignore
const reservedKeywords = new Set(['associatedtype', 'class', 'deinit', 'enum', 'extension',
  'fileprivate', 'func', 'import', 'init', 'inout', 'internal', 'let', 'open',
  'operator', 'private', 'protocol', 'public', 'static', 'struct', 'subscript',
  'typealias', 'var', 'break', 'case', 'continue', 'default', 'defer', 'do',
  'else', 'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return',
  'switch', 'where', 'while', 'as', 'Any', 'catch', 'false', 'is', 'nil',
  'rethrows', 'super', 'self', 'Self', 'throw', 'throws', 'true', 'try',
  'associativity', 'convenience', 'dynamic', 'didSet', 'final', 'get', 'infix',
  'indirect', 'lazy', 'left', 'mutating', 'none', 'nonmutating', 'optional',
  'override', 'postfix', 'precedence', 'prefix', 'Protocol', 'required', 'right',
  'set', 'Type', 'unowned', 'weak', 'willSet']);

export function escapeIdentifierIfNeeded(identifier: string) {
  if (reservedKeywords.has(identifier)) {
    return '`' + identifier + '`';
  } else {
    return identifier;
  }
}

export class SwiftGenerator<Context> extends CodeGenerator<Context, { typeName: string }> {
  constructor(context: Context) {
    super(context);
  }

  multilineString(string: string) {
    this.printOnNewline(`"${escapedString(string)}"`);
  }

  comment(comment?: string) {
    comment &&
      comment.split('\n').forEach(line => {
        this.printOnNewline(`/// ${line.trim()}`);
      });
  }

  deprecationAttributes(isDeprecated: boolean | undefined, deprecationReason: string | undefined) {
    if (isDeprecated !== undefined && isDeprecated) {
      deprecationReason = (deprecationReason !== undefined && deprecationReason.length > 0) ? deprecationReason : ""
      this.printOnNewline(`@available(*, deprecated, message: "${escapedString(deprecationReason)}")`)
    }
  }

  namespaceDeclaration(namespace: string | undefined, closure: Function) {
    if (namespace) {
      this.printNewlineIfNeeded();
      this.printOnNewline(`/// ${namespace} namespace`);
      this.printOnNewline(`public enum ${namespace}`);
      this.pushScope({ typeName: namespace });
      this.withinBlock(closure);
      this.popScope();
    } else {
      if (closure) {
        closure();
      }
    }
  }

  classDeclaration({ className, modifiers, superClass, adoptedProtocols = [] }: Class, closure: Function) {
    this.printNewlineIfNeeded();
    this.printOnNewline(wrap('', join(modifiers, ' '), ' ') + `class ${className}`);
    this.print(wrap(': ', join([superClass, ...adoptedProtocols], ', ')));
    this.pushScope({ typeName: className });
    this.withinBlock(closure);
    this.popScope();
  }

  structDeclaration({ structName, description, adoptedProtocols = [] }: Struct, closure: Function) {
    this.printNewlineIfNeeded();
    this.comment(description);
    this.printOnNewline(`public struct ${structName}`);
    this.print(wrap(': ', join(adoptedProtocols, ', ')));
    this.pushScope({ typeName: structName });
    this.withinBlock(closure);
    this.popScope();
  }

  propertyDeclaration(
    property: Property,
    isOptional: boolean = true,
    isList: boolean = false,
    ) {
      let {propertyName, type, typeName, description} = property
      if (type instanceof GraphQLNonNull) {
        this.propertyDeclaration(
          {
            propertyName: propertyName,
            typeName:typeName,
            type: type.ofType
          },
          false,
          isList
        )
        return
      } else if (type instanceof GraphQLList) {
        this.propertyDeclaration(
          {
            propertyName: propertyName,
            typeName:typeName,
            type: type.ofType
          },
          isOptional,
          true
        )
        return
      }

    this.comment(description);
    if (isList) {
      this.printOnNewline(`let ${propertyName} = List<${typeName}>()`);
    } else if (type instanceof GraphQLObjectType) {
      // dynamic var value: Class?
      this.printOnNewline(`dynamic var ${propertyName}: ${typeName}?`);
    } else if (type instanceof GraphQLScalarType) {
      switch (type.name) {
        case GraphQLBoolean.name: {
          if (isOptional) {
            // let value = RealmOptional<Bool>()
            this.printOnNewline(`let ${propertyName} = RealmOptional<Bool>()`);
          } else {
            // dynamic var value = false
            this.printOnNewline(`dynamic var ${propertyName} = false`);
          }
        }
        break
        case GraphQLInt.name: {
          if (isOptional) {
            // let value = RealmOptional<Int>()
            this.printOnNewline(`let ${propertyName} = RealmOptional<Int>()`);
          } else {
            // dynamic var value = false
            this.printOnNewline(`dynamic var ${propertyName} = 0`);
          }
        }
        break
        case GraphQLFloat.name: {
          if (isOptional) {
            // let value = RealmOptional<Float>()
            this.printOnNewline(`let ${propertyName} = RealmOptional<Float>()`);
          } else {
            // dynamic var value: Float = 0.0
            this.printOnNewline(`dynamic var ${propertyName}: Float = 0.0`);
          }
        }
        break
        case GraphQLString.name: {
          if (isOptional) {
            // dynamic var value: String? = nil
            this.printOnNewline(`dynamic var ${propertyName}: String? = nil`);
          } else {
            // dynamic var value = ""
            this.printOnNewline(`dynamic var ${propertyName} = ""`);
          }
        }
        break
        case GraphQLID.name: {
          if (isOptional) {
            // dynamic var value: String? = nil
            this.printOnNewline(`dynamic var ${propertyName}: String? = nil`);
          } else {
            // dynamic var value = ""
            this.printOnNewline(`dynamic var ${propertyName} = ""`);
          }
          this.printOnNewline(`override public static func primaryKey() -> String?`)
          this.withinBlock(() => {
            this.printOnNewline(`return "${propertyName}"`)
          });
        }
        break
        default: {
          this.printOnNewline(`UNCAUGHT SCALAR ${type.name}`);
        }
      }
    } else if (type instanceof GraphQLEnumType){
      this.printOnNewline(`dynamic var ${propertyName}: String? = nil`);
    }
  }


  propertyDeclarations(properties: Property[]) {
    if (!properties) return;
    properties.forEach(property => this.propertyDeclaration(property));
  }

  protocolDeclaration({ protocolName, adoptedProtocols }: Protocol, closure: Function) {
    this.printNewlineIfNeeded();
    this.printOnNewline(`public protocol ${protocolName}`);
    this.print(wrap(': ', join(adoptedProtocols, ', ')));
    this.pushScope({ typeName: protocolName });
    this.withinBlock(closure);
    this.popScope();
  }

  protocolPropertyDeclaration({ propertyName, typeName }: Property) {
    this.printOnNewline(`var ${propertyName}: ${typeName} { get }`);
  }

  protocolPropertyDeclarations(properties: Property[]) {
    if (!properties) return;
    properties.forEach(property => this.protocolPropertyDeclaration(property));
  }
}
