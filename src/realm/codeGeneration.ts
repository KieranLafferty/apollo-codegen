import {
  GraphQLType,
  isOutputType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLField,
  GraphQLNonNull
} from 'graphql';

import { camelCase } from 'change-case';

import {
  join,
} from '../utilities/printing';

import { CompilerContext} from '../compiler';

import { SwiftGenerator, escapeIdentifierIfNeeded } from './language';
import { Helpers } from './helpers';

import '../utilities/array';

export interface Options {
  namespace?: string;
  passthroughCustomScalars?: boolean;
  customScalarsPrefix?: string;
}

export function generateSource(context: CompilerContext) {
  const generator = new RealmModelGenerator(context);

  generator.fileHeader();

  generator.namespaceDeclaration(context.options.namespace, () => {
    Object.values(context.schema.getTypeMap()).forEach(type => {
      generator.realmTypeDeclarationType(type)
    });
  });

  return generator.output;
}

export class RealmModelGenerator extends SwiftGenerator<CompilerContext> {
  helpers: Helpers;

  constructor(context: CompilerContext) {
    super(context);
    this.helpers = new Helpers(context.options);
  }

  fileHeader() {
    this.printOnNewline('//  This file was automatically generated and should not be edited.');
    this.printNewline();
    this.printOnNewline('import Apollo');
    this.printOnNewline('import Realm');
    this.printOnNewline('import RealmSwift');
  }

  realmTypeDeclarationType(type: GraphQLType) {

    if (type instanceof GraphQLObjectType && isOutputType(type)) {
      const typeName = type.name;
      const prefix = '__';
      if (!typeName.startsWith(prefix)) {
        this.generateOutputObjectForType(type)
      }
    }
  }

  generateOutputObjectForType(type: GraphQLObjectType) {
    const classPrefix = ""
    const className = classPrefix + type.name

    this.classDeclaration(
      {
        className,
        modifiers: ['public', 'final'],
        adoptedProtocols: ["Object"]
      },
      () => {
        Object.values(type.getFields()).forEach(field => {
          this.generateFieldDeclaration(field, classPrefix)
        });
      }
    );
  }

  generateFieldDeclaration(field: GraphQLField<any, any>, classPrefix: String) {
    if (field.description != null) {
      this.comment(field.description)
    }
    this.propertyDeclaration({
      propertyName: camelCase(field.name),
      typeName:this.helpers.rootTypeNameFromGraphQLType(field.type),
      type: field.type
    });
  }

  generateOutputObjectInitializer(object: GraphQLObjectType) {
    const fieldsMap = Object.values(object.getFields())

    this.printNewline()
    this.printOnNewline(`public init`);
    this.parametersForFields(fieldsMap);
    this.withinBlock(() => {
      fieldsMap.forEach(({ name }) => {
        const propertyName = camelCase(name)
        this.printOnNewline(`self.${propertyName} = ${propertyName}`);
      });
      this.printOnNewline(`super.init()`)
    });
  }

  parametersForFields(fields: GraphQLField<any, any>[]) {
    this.print('(');
    this.print(
      join(
        fields.map(({ name, type }) =>
          this.parameterForFieldName(camelCase(name), type)
        ),
        ', '
      )
    );
    this.print(')');
  }

  parameterForFieldName(fieldName: string, type: GraphQLType): string {
    const typeName = this.helpers.typeNameFromGraphQLType(type)
    const isOptional = !(type instanceof GraphQLNonNull)
    return join(
      [`${escapeIdentifierIfNeeded(fieldName)}: ${typeName}`, isOptional && ' = nil']
    )
  }

  overrideDesignatedInitializers() {
    this.printOnNewline(`
  required public init(value: Any, schema: RLMSchema) {
    fatalError("init(value:schema:) has not been implemented")
  }

  required public init() {
    fatalError("init() has not been implemented")
  }

  required public init(realm: RLMRealm, schema: RLMObjectSchema) {
    fatalError("init(realm:schema:) has not been implemented")
  }
    `)
  }
}
