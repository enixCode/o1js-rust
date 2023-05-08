import {
  Poseidon,
  PublicKey,
  Field,
  Group,
  Struct,
  MerkleMapWitness,
  Scalar,
} from 'snarkyjs';
import type { Nullifier as JsonNullifier } from '../mina-signer/src/TSTypes.js';
import { scaleShifted } from './signature.js';

export { Nullifier };

/**
 * RFC: https://github.com/o1-labs/snarkyjs/issues/756
 *
 * Paper: https://eprint.iacr.org/2022/1255.pdf
 */
class Nullifier extends Struct({
  message: Field,
  publicKey: PublicKey,
  public: {
    nullifier: Group,
    s: Scalar,
  },
  private: {
    c: Field,
    g_r: Group,
    h_m_pk_r: Group,
  },
}) {
  static fromJSON(json: JsonNullifier): Nullifier {
    return super.fromJSON(json as any) as Nullifier;
  }

  /**
   * Verifies the correctness of the Nullifier. Throws an error if the Nullifier is incorrect.
   */
  verify() {
    let {
      message,
      publicKey,
      public: { nullifier, s },
      private: { c },
    } = this;

    let G = Group.generator;

    let pk_fields = [
      publicKey.isOdd.toBoolean() ? Field(1) : Field(0),
      publicKey.x,
    ];

    let {
      x,
      y: { x0 },
    } = Poseidon.hashToGroup([message, ...pk_fields]);

    // see https://github.com/o1-labs/snarkyjs/blob/5333817a62890c43ac1b9cb345748984df271b62/src/lib/signature.ts#L220
    let pk_c = scaleShifted(publicKey.toGroup(), Scalar.fromBits(c.toBits()));

    // g^r = g^s / pk^c
    let g_r = G.scale(s).sub(pk_c);

    let h_m_pk = Group.fromFields([x, x0]);

    let h_m_pk_s = Group.scale(h_m_pk, s);

    // h_m_pk_r =  h(m,pk)^s / nullifier^c
    let h_m_pk_s_div_nullifier_s = h_m_pk_s.sub(
      scaleShifted(nullifier, Scalar.fromBits(c.toBits()))
    );

    console.log(JSON.stringify(h_m_pk_s_div_nullifier_s));

    Poseidon.hash([
      ...Group.toFields(G),
      ...pk_fields,
      x,
      x0,
      ...Group.toFields(nullifier),
      ...Group.toFields(g_r),
      ...Group.toFields(h_m_pk_s_div_nullifier_s),
    ]).assertEquals(c, 'Nullifier does not match private input!');
  }

  /**
   * The key of the nullifier, which belongs to a unique message and a public key.
   * Used as an index in Merkle trees.
   */
  key() {
    return Poseidon.hash(Group.toFields(this.public.nullifier));
  }

  /**
   * Checks if the Nullifier has been used before.
   */
  isUnused(witness: MerkleMapWitness, root: Field) {
    return witness.computeRootAndKey(Field(0))[0].equals(root);
  }

  /**
   * Sets the Nullifier, returns the new Merkle root.
   */
  setUsed(witness: MerkleMapWitness) {
    return witness.computeRootAndKey(Field(1))[0];
  }
}
